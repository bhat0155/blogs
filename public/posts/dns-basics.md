# Mastering the Web: How DNS Powers the Cloud 🌐 (Assignment 5)

So, you’ve built a Virtual Machine in Azure—but how does the world actually find it? 

Welcome to the **Domain Name System (DNS)**. 

If a Virtual Machine is the "house" where your code lives, DNS is the **Global GPS** that directs users to your front door. Without it, we’d all be memorizing strings of numbers just to check our email.

---

## 1) The Resolution Flow: How a User Finds Your Site

Understanding the "handshake" between different providers is key to mastering DNS. Here is the exact path a request takes:

1. **User Types URL:** A user enters `labs.bhangrascape.ca` into their browser.
2. **ISP Inquiry:** The user's **ISP** (Internet Service Provider) takes the request and looks for the "Authoritative" source.
3. **GoDaddy Redirection:** The ISP finds the domain at **GoDaddy**. GoDaddy says: "I don't have the IP, but I point to the **Azure DNS Zone** name servers."
4. **Azure Lookup:** The request hits the **Azure Name Servers**. Azure looks at the A-Record and **finds the IP** ($172.208.67.131$).
5. **Site Delivery:** The browser now knows exactly where to go. It travels to the VM's IP and **shows the site** content.



---

## 2) Core Concepts: The "Internet Phonebook"

**What is DNS?** DNS translates human-friendly names (like `bhangrascape.ca`) into machine-friendly IP addresses (like `172.208.67.131`).

**A Record vs CNAME**
- **A Record (Address):** Maps a name directly to an **IPv4 Address**. (Used for our VM).
- **CNAME (Canonical Name):** Maps one domain name to another name (Alias).

---

## 3) The Lifecycle: From GoDaddy to Azure

**Registering a Domain** This is the process of claiming your "Digital Identity." I used **GoDaddy** to purchase `bhangrascape.ca`. This involves:
- Verifying availability and choosing a registrar.
- Proving "Canadian Presence" (CIRA requirements for .ca).
- Paying a yearly fee to keep the name in the global registry.

**Delegation (The Handover)** Just because you bought a domain at GoDaddy doesn't mean you have to manage the records there. By updating the **Name Servers (NS)** in GoDaddy to point to **Azure**, you "delegate" the authority. Azure becomes the "Architect" holding the blueprints for your site.



---

## 4) Practical Implementation: The Azure Setup

| Step | Action | Why it matters |
|---|---|---|
| **1. Resource Group** | Created `dns` | Logical container to keep our networking assets organized. |
| **2. DNS Zone** | Created `bhangrascape.ca` | The "Master File" in Azure that will hold all our custom records. |
| **3. A Record** | Added `labs` -> `172.208.67.131` | Points a specific subdomain to our Assignment 3 VM. |
| **4. NS Records** | Identified 4 Azure Name Servers | These are the addresses we give GoDaddy to complete the "Handover." |



---

 ## 5) Common Gotchas

**Why use a Subdomain (labs)?** Using a subdomain like `labs.bhangrascape.ca` allows us to test Azure infrastructure and Virtual Machine connectivity without altering primary domain records. This is a standard **Development vs. Production** strategy.

**TTL (Time to Live)** This setting (usually 3600 seconds / 1 hour) tells the internet how long to "cache" or remember your IP address before checking Azure for an update.

**The Authoritative Name Server** In this lab, **Azure** is the Authoritative Name Server. It holds the final, "True" mapping of where our `labs` site is located.

---

## Final Thoughts

DNS can feel like "magic" until you configure it yourself. Seeing a name you purchased on GoDaddy resolve to a server you built in Azure is a "lightbulb moment" for any developer.

**Key Takeaway:** By experimenting with subdomains in Azure DNS Zones, you learn high-level networking and how to manage global traffic routing effectively.

Good luck to everyone mapping their first cloud domains! 🚀