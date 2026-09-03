
## What Is Network Watcher?

Azure Network Watcher is a diagnostics and monitoring toolset for Azure networking. It doesn't move traffic or configure routes itself, but it lets you *see* what's actually happening to traffic as it flows through your VNet, NSGs, and routing tables. Think of it like a stethoscope and an X-ray machine for your network: your VNet and NSGs are the patient, and Network Watcher is how you find out what's actually wrong instead of guessing from symptoms alone.

The core problem it solves is one every cloud engineer eventually hits: a connection fails, and there are five possible layers where it could be failing (routing, NSG rules at the subnet or NIC level, the guest OS firewall, the application itself, or something upstream). Without tooling, you're left SSH-ing in, checking `iptables`, re-reading NSG rules by eye, and hoping you spot the misconfigured priority. Network Watcher replaces that guesswork with six purpose-built tools:

- **IP Flow Verify** - simulates whether a specific traffic flow would be allowed or denied, and tells you exactly which rule decided that.
- **Effective Security Rules** - shows the fully merged, priority-sorted rule set across NIC and subnet NSGs.
- **Connection Troubleshoot** - runs a live, real packet-based end-to-end check between two endpoints.
- **NSG Flow Logs** - a persistent, timestamped log of allow/deny decisions over time.
- **Packet Capture** - captures actual bytes on the wire, the ground truth of what did or didn't arrive.
- **Next Hop** - confirms how traffic is being routed, so you can rule routing in or out as a cause.

## Why Does It Matter?

Without these tools, diagnosing a connectivity failure in Azure is mostly archaeology. You re-read every NSG attached to the subnet and the NIC, try to mentally sort them by priority, and hope you didn't miss a rule. That approach doesn't scale past a handful of rules, and it falls apart fast once there are two NSGs in play (NIC + subnet), since the human brain is bad at merging two independently sorted priority lists in its head.

Worse, without a layered set of tools, it's easy to draw the wrong conclusion entirely. A single tool checked in isolation can lie to you by omission. If you only check the NSG and it says "allowed," you might assume the network is fine and go looking in the wrong place, when the actual block is happening one layer up, inside the guest OS firewall. The real value of Network Watcher isn't any single tool, it's using them *in combination* so each one's blind spot is covered by another. IP Flow Verify tells you what a rule *would* do, Packet Capture tells you what *actually* happened, and the gap between those two answers is often the most important diagnostic signal you get.

The other cost of not knowing this tooling well is speed. In a real incident, "what changed and why is it broken" needs to go from ticket to root cause in minutes, not by trial-and-error editing of NSG rules until something starts working again. That approach fixes the symptom without you ever understanding the cause, and leaves you no better prepared for the next one.

## What I Built / What I Did

I built a minimal two-VM lab in Azure specifically to practice diagnosing a network failure the way you'd encounter it in a real incident: symptom first, tools second, root cause discovered, not recalled.

The topology: a resource group (`rg-netwatcher-lab`) containing a VNet (`vnet-lab`, `10.10.0.0/16`) with a single subnet (`subnet-web`, `10.10.1.0/24`), an NSG (`nsg-web`) attached at the subnet level allowing SSH/RDP from my own IP and HTTP from `VirtualNetwork`, and two B1s VMs in that subnet: `vm-client` (the test source) and `vm-web` (running `nginx`, the test target).

The goal was to first establish a known-good baseline (`curl` to `vm-web` succeeds, and IP Flow Verify confirms "Access allowed"), then deliberately introduce a break (a higher-priority NSG **Deny** rule on port 80) without documenting exactly what I changed, and force myself to rediscover the cause using nothing but the Network Watcher toolchain. Success meant reaching the correct root cause using at least two independent tools that agreed with each other, then fixing it and confirming the fix against the original baseline.

## How I Implemented It

### 1. Establish a baseline before breaking anything

Before introducing any fault, I confirmed the happy path worked and recorded exactly how I verified it, meaning the specific command and the specific expected output. This mattered more than it sounds. Without a documented baseline, "is it fixed?" later becomes a matter of opinion instead of an exact match.

```bash
curl -m 5 http://<vm-web-private-ip>
```

Expected: the nginx welcome page. I also ran IP Flow Verify while things were healthy, targeting `vm-web`'s NIC, direction Inbound, protocol TCP, local port 80, so I'd know what a "healthy" result looks like in the tool (Access allowed, citing the specific rule that permitted it), not just what a healthy `curl` looks like.

### 2. Break it deliberately, then treat it like someone else's ticket

I added an inbound **Deny** rule to `nsg-web`:

| Field | Value |
|---|---|
| Priority | `100` |
| Source | `VirtualNetwork` |
| Destination | `Any` |
| Port | `80` |
| Protocol | `TCP` |
| Action | `Deny` |
| Name | `TEMP-block-http` |

The choice of priority `100` was deliberate. NSG rules evaluate lowest-priority-number-first, and I needed this deny to be evaluated *before* the existing allow-HTTP rule for it to take effect. This is the core mechanic that trips people up in real environments: **rule evaluation order is driven by the priority number, not by the order rules happen to appear in the portal list.** Two engineers can look at the same rule set displayed in a different sort order and disagree about which rule "wins" unless they're both anchored to priority.

I resisted the urge to keep the rule name in mind while diagnosing. The point of the exercise was to practice diagnosing from symptom to cause using tools, not memory.

### 3. Confirm the symptom, then diagnose layer by layer

Re-running the exact same `curl` command now timed out. That reproducible symptom was the starting point, the same way an on-call engineer starts from "customers can't reach the service," not from "someone added a deny rule."

From there I worked through the tools in order of speed and specificity:

**IP Flow Verify** (fastest first check): same inbound TCP flow, local port 80. Result: **Access denied**, naming `TEMP-block-http` directly and confirming which NSG it lived on (subnet-level in my case). This single check usually pinpoints the exact rule immediately, which is why it's the right first move rather than jumping straight to packet capture.

**Effective Security Rules**: pulled from `vm-web`'s NIC, this gave the fully merged rule set (NSG + subnet, sorted by priority) in one view. `TEMP-block-http` showed up at priority `100`, ahead of the allow-HTTP rule. This is the tool that matters once you have more than one NSG in play (NIC-level *and* subnet-level). IP Flow Verify answers "what happens to this one flow," Effective Security Rules answers "why, and what else is going on."

**Connection Troubleshoot**: an actual live, packet-based end-to-end test (not a rule simulation like IP Flow Verify), from `vm-client` to `vm-web:80`. It reported failure and called out the same blocking rule in its breakdown. The value here is that it validates the IP Flow Verify conclusion through an entirely different mechanism, real traffic instead of simulation, so agreement between the two is strong evidence, not a coincidence.

**NSG Flow Logs**: enabled on `nsg-web`, version 2 (for byte/packet counts and flow state), pointed at a storage account. After generating a few more failed connection attempts, I found the corresponding flow tuple in the log with outcome `D` (deny). This is the only tool in the set that gives a *persistent, timestamped* record. None of the other tools can answer "what happened at 2pm yesterday," only "what happens right now."

**Packet Capture**: targeted `vm-web`, filtered to TCP port 80, 60-second duration. I started the capture, immediately fired several `curl` attempts from `vm-client`, then downloaded the `.cap` file and opened it. Result: **no inbound SYN reached the NIC at all**, direct proof the NSG dropped the packet before it ever touched the VM, as opposed to the VM receiving it and rejecting it. This is ground truth. Everything before this step is Azure's control plane telling you what it *thinks* should happen; packet capture is what actually happened on the wire.

**Next Hop**: source `vm-client`, destination `vm-web`'s private IP. Result: `VNet local` / `Direct`, no next hop involved. This ruled out routing as a contributing factor entirely, which is worth doing even when you're fairly confident it's the NSG. It converts an assumption into a confirmed fact, and takes about ten seconds.

### 4. Fix it and verify against the original baseline, not a new assumption

I removed the `TEMP-block-http` rule, then re-ran IP Flow Verify for the identical tuple, now **Access allowed**, citing the correct allow rule. Only then did I go back to `vm-client` and re-run the *original* `curl` command, confirming it matched the Step 2 baseline exactly. A minute later I re-checked NSG Flow Logs and confirmed new connections now logged outcome `A` (allow).

The gotcha worth calling out: fixing the symptom (traffic flows again) isn't the same as confirming the fix via the same tool that diagnosed the problem. Closing the loop through IP Flow Verify, not just `curl`, is what proves the *mechanism* is fixed, not just that something changed that happened to help.

### 5. A second pass to expose a blind spot (host-level firewall)

On a second run, instead of an NSG deny rule, I blocked port 80 in the guest OS firewall on `vm-web` (`ufw deny 80`) and left the NSG untouched. IP Flow Verify and Connection Troubleshoot both reported **allowed**, correctly, since the NSG genuinely does allow the traffic. The connection still failed.

This is the most important lesson of the whole lab: **Network Watcher's NSG-focused tools can only prove the NSG isn't the problem. They say nothing about layers above the NSG.** Packet Capture was the tool that broke the tie. It showed the SYN arriving at the NIC (so the NSG did let it through) but no application-layer response coming back, pointing squarely at the guest OS instead. Without running packet capture, "allowed" from two independent NSG tools could easily be mistaken for "the network is fine," sending you down the wrong troubleshooting path entirely.

## Key Takeaways

- **Start with IP Flow Verify, not Packet Capture.** It's the fastest way to get a direct answer and a named rule; save the heavier tools for confirmation or for cases where the fast tool comes back inconclusive.
- **"Allowed" from an NSG tool only proves the NSG isn't the problem, not that nothing is wrong.** Any layered troubleshooting flow needs a tool that inspects a layer *other* than the NSG (Packet Capture, or checking the guest OS directly) to fully rule things out.
- **Priority number, not portal display order, determines which NSG rule wins.** Never reason about rule precedence by eyeballing a list. Check the priority column, or better, pull Effective Security Rules and let Azure do the merge.
- **NSG Flow Logs are the only tool with memory.** IP Flow Verify, Connection Troubleshoot, and Packet Capture all describe the current or a just-captured moment; if you need to answer "what happened at 2pm yesterday," flow logs are the only source that has that data.
- **Diagnose from symptom to cause, not from memory of the change.** Deliberately not looking at what you changed (or treating a real ticket as if you don't know) forces you to actually exercise the tools instead of confirming something you already know.
- **Confirm a fix through the same tool that diagnosed it, not just through the end-user symptom.** A working `curl` after a fix is necessary but not sufficient. Re-running IP Flow Verify (or Connection Troubleshoot) proves the mechanism, not just the outcome.
- **Rule out routing explicitly, even when you're confident it's not the cause.** Next Hop takes seconds and converts an assumption into a documented fact, cheap insurance in an incident writeup.

## Final Thoughts

What surprised me most was how much of the diagnostic value came not from any single tool but from the *disagreement* (or expected agreement) between tools. IP Flow Verify and Packet Capture telling the same story is reassuring, but IP Flow Verify saying "allowed" while the connection still fails is actually the more instructive result, because it tells you precisely where your NSG-focused tooling's authority ends. Doing the host-firewall variant (Option C) after the NSG-deny variant (Option A) was the single most useful part of the lab. It's easy to build a mental model where "Network Watcher says allowed" means "the network is fine," and this lab is what broke that assumption for me. Next time I'd add a load balancer or NAT gateway into the topology, since Next Hop and Effective Security Rules both get more interesting, and more necessary, the moment there's more than one path or more than one NSG for traffic to cross.
