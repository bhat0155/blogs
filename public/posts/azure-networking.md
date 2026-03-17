# Azure Networking Basics with One Virtual Machine

When I started learning Azure networking, the terms felt confusing at first. So instead of memorizing definitions, I created one virtual machine and learned each networking concept around it. That made everything much easier to understand.

In this blog, I’ll explain the basics of:

- VM
- VNet
- subnet
- private/public IP
- NIC
- NSG

using the simple lab I built.

## VM

A **Virtual Machine (VM)** is basically a computer running in Azure.

You can think of it as a machine on rent. Instead of buying physical hardware, Azure gives you a software-defined computer with CPU, memory, disk, operating system, and networking.

In my lab, I created a Linux VM called:

- `vm-web-1`

Later, I installed **nginx** on it and tested network access to understand how Azure networking works in real life.

## VNet

A **Virtual Network (VNet)** is the private network boundary in Azure.

It is like the private area where your Azure resources live and communicate. If multiple VMs are inside the same VNet, they can talk to each other using private networking.

In my lab, the VNet was:

- `vm-web-1-vnet`

So the VNet was the overall private network space for my VM.

A simple way to think about it is:

- **VM** = computer
- **VNet** = private neighborhood for Azure resources

## Subnet

A **subnet** is a smaller section inside the VNet.

If the VNet is the whole neighborhood, the subnet is one part of that neighborhood. In real environments, different subnets are often used for:

- web servers
- app servers
- databases
- firewall components

In my lab, the VM was placed in:

- VNet: `vm-web-1-vnet`
- Subnet: `default`

So when Azure showed:

- `vm-web-1-vnet / default`

it meant the VM was inside the **default subnet** of the **vm-web-1-vnet** VNet.

## Private IP and Public IP

This was one of the most important things to understand.

### Private IP

A **private IP** is used for communication inside the private Azure network.

In my lab, the VM had:

- Private IP: `10.0.0.4`

This means that if another resource inside the same VNet wanted to talk to my VM, it would use this private IP.

So private IP is mainly for **internal/private communication**.

### Public IP

A **public IP** is used when something outside Azure, like my laptop, wants to reach the VM.

In my lab, the VM had:

- Public IP: `20.55.43.1`

I used this public IP to SSH into the VM from my computer.

A big lesson I learned here was:

> A public IP alone does not mean the VM is fully reachable.

The traffic also depends on security rules and whether the service is actually running.

## NIC

A **NIC** stands for **Network Interface Card**.

This is the VM’s network interface. It is the thing that connects the VM to the subnet and carries the IP configuration.

In my lab, the NIC was:

- `vm-web-1574_z1`

This helped me understand something very important:

> The VM does not directly connect to the VNet by itself.  
> It connects through the NIC.

So the path is more like:

- **VM → NIC → subnet → VNet**

The NIC holds things like:

- private IP
- public IP association
- NSG association

That is why the NIC is such an important networking object in Azure.

## NSG

An **NSG** stands for **Network Security Group**.

This is like a security guard for network traffic. It checks whether certain inbound or outbound traffic should be allowed or denied.

In my lab, the NSG was:

- `vm-web-1-nsg`

Initially, it allowed:

- **SSH on port 22**

That is why I could log into the VM using SSH.

Later, I installed nginx and tested this command inside the VM:

```bash
curl http://localhost
```

This worked, which proved that nginx was running on the VM itself.

But when I tried opening the website from my browser using the public IP, it did **not** work at first.

Why?

Because even though:

- the VM had a public IP
- nginx was running

the **NSG had not allowed port 80 yet**.

Once I added an inbound NSG rule to allow **TCP 80**, the browser successfully opened:

- `http://20.55.43.1`

That was the moment the concept really clicked.

The lesson was:

> Public IP gives outside reachability, but the NSG decides whether that traffic is allowed.

## What I Learned from This Lab

This small lab taught me the practical relationship between all the networking pieces:

- **VM** is the machine
- **VNet** is the private network boundary
- **Subnet** is the smaller network section inside the VNet
- **NIC** connects the VM to the network
- **Private IP** is for internal communication
- **Public IP** is for outside communication
- **NSG** controls which traffic is allowed or denied

The biggest real-world lesson was this:

> For connectivity to work, you usually need the right IP, the right NSG rules, and the actual service running on the VM.

That is exactly why troubleshooting network issues in real DevOps scenarios often means checking:

- the IP
- the NSG
- the service
- and sometimes the OS firewall too

## Final Thoughts

Before this lab, these Azure networking terms felt abstract. But creating a VM and testing SSH, nginx, localhost, and port 80 made them much easier to understand.

Instead of memorizing definitions, I now understand how these components work together in practice.

That is what made the learning stick.
