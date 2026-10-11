#!/bin/sh
set -eu
# Runs only inside this container's network namespace. It never changes host rules.
# Docker initially grants NET_ADMIN/SETUID/SETGID/SETPCAP; all are dropped before Node.
iptables -F INPUT
iptables -F OUTPUT
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -s "$MST_JOBS_GATEWAY_ADDRESS" -p tcp --dport 4174 -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -d "$MST_JOBS_PADDLE_IP" -p tcp --dport 7018 -j ACCEPT
iptables -P INPUT DROP
iptables -P OUTPUT DROP
ip6tables -P INPUT DROP
ip6tables -P OUTPUT DROP
exec setpriv --reuid=1000 --regid=1000 --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all /opt/node/bin/node server-dist/main.mjs
