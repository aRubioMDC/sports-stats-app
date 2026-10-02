# HitRate Self-Host Deployment Guide

Practical, start-to-finish runbook for hosting **HitRate** on an old personal
computer: Ubuntu Server 24.04, Docker Compose,
Cloudflare Tunnel, HTTPS, reachable at `https://hitrate.app` — database stays on
Supabase (nothing to self-host there).

This is a **personal side project**, not an enterprise deployment: every
recommendation below optimizes for low cost, low maintenance, and "good enough"
security for a low-traffic public app, not for handling sensitive data at scale.

## Target architecture

```
Users → Cloudflare (DNS + edge TLS) → Cloudflare Tunnel (outbound-only)
       → Ubuntu Server 24.04 (Docker)
           ├── cloudflared   (connects out to Cloudflare, routes to nginx)
           ├── nginx         (reverse proxy, the only internal entry point)
           ├── frontend      (nginx + built React/Vite SPA, static only)
           └── backend       (FastAPI/uvicorn)
       → Supabase Postgres (already hosted, outside this box)
```

Key design choice: **no port is ever published to the host or the router.**
`cloudflared` reaches `nginx` over the internal Docker network only, so UFW can
deny all inbound traffic except SSH. HTTPS is terminated by Cloudflare's edge —
there is no certbot/Let's Encrypt anywhere in this stack.

Files this guide builds on (already generated in this repo):
[infra/docker-compose.yml](infra/docker-compose.yml),
[infra/backend.Dockerfile](infra/backend.Dockerfile),
[infra/frontend.Dockerfile](infra/frontend.Dockerfile),
[infra/nginx/reverse-proxy.conf](infra/nginx/reverse-proxy.conf),
[infra/nginx/frontend.conf](infra/nginx/frontend.conf),
[infra/cloudflared/config.yml.example](infra/cloudflared/config.yml.example),
[infra/.env.example](infra/.env.example),
[infra/scripts/bootstrap-host.sh](infra/scripts/bootstrap-host.sh),
[infra/scripts/deploy.sh](infra/scripts/deploy.sh),
[infra/scripts/rollback.sh](infra/scripts/rollback.sh),
[infra/scripts/post-deploy-smoke.sh](infra/scripts/post-deploy-smoke.sh),
[infra/scripts/release-rehearsal.sh](infra/scripts/release-rehearsal.sh),
[infra/scripts/rehearsal-report.sh](infra/scripts/rehearsal-report.sh),
[infra/scripts/backup-db.sh](infra/scripts/backup-db.sh),
[.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml).

---

## 1. Hardware requirements

**Why**: this app is stateless (no local DB — Supabase holds all data), so the
box only needs to run 4 lightweight containers and build nothing locally.

What you have: AMD A10 (6th-gen, Kaveri-class APU), ~174GB disk, Ubuntu
18.04.6 Desktop currently installed. That's sufficient:
- CPU: any x86-64 CPU from the last ~12 years runs Ubuntu 24.04 and idle Docker
  containers fine — there's no local build or heavy compute happening here
  (images are built in GitHub Actions, see section 31).
- RAM: 4GB is a safe minimum for 4 small containers + OS; 8GB is comfortable.
  Confirm yours with `free -h` after install. Regardless of the real number, we
  add a 2GB swap file (section 2/bootstrap script) as cheap insurance.
- Disk: 174GB is far more than needed (images + logs + DB backups realistically
  use a few GB total).

**Common mistakes**: assuming you need a GPU or a modern CPU — you don't, this
isn't running any ML workload locally. Trying to build frontend/backend images
*on this box* — don't; it's slow on old hardware and is handled by CI instead.

**Security considerations**: none specific to hardware; just make sure the box
is on a wired connection or stable Wi-Fi so the tunnel doesn't flap.

## 2. Ubuntu Server installation

**Why**: Ubuntu Server 24.04 LTS (no desktop environment) has a smaller attack
surface and no GUI overhead running 24/7 — your current Ubuntu 18.04.6 Desktop
is both outdated (EOL) and unnecessarily heavy for a headless server.

**Steps**:
1. On another computer, download the Ubuntu Server 24.04 LTS ISO from
   ubuntu.com and flash it to a USB stick with Rufus (Windows) or balenaEtcher.
2. Boot the old PC from the USB (F2/F10/F12/Del at boot depending on the
   motherboard — AMD A10 boards are typically F2 or Del for BIOS/boot menu).
3. In the installer: wipe the disk (this erases the existing 18.04 Desktop),
   pick "Ubuntu Server" (not "minimized"), enable OpenSSH server when prompted
   (saves a step later), skip snap extras (you don't need them).
4. Create your first user during install — this becomes your sudo-capable
   account (you'll still do extra SSH hardening in section 5).

**Expected output**: after reboot and removing the USB, you get a login
prompt (`hitrate login:` or similar) — no GUI, just a console.

**Validate success**: `lsb_release -a` shows `24.04`; `uname -m` shows
`x86_64`; `ip a` shows your LAN IP.

**Common mistakes**: forgetting to enable OpenSSH during install (you'd need
physical keyboard/monitor access to fix it); installing "Ubuntu Desktop"
instead of "Server" by habit.

**Security considerations**: don't enable any extra services you don't need
at install time (no LAMP stack, no samba) — smaller surface area.

## 3. Basic Linux configuration

**Why**: a stable hostname/timezone and a fixed local IP keep the box
reachable the same way every time (useful for SSH and for the DHCP
reservation your router needs).

**Commands**:
```bash
sudo hostnamectl set-hostname hitrate-host
sudo timedatectl set-timezone America/Mexico_City   # adjust to your timezone
timedatectl
```
On your router's admin page, set a **DHCP reservation** (static lease) for
this box's MAC address, so its LAN IP never changes — simpler and safer than
configuring a static IP by hand on the box (less to misconfigure).

**Validate success**: `hostnamectl` shows the new hostname; `date` shows the
correct local time; the box keeps the same IP after a reboot.

**Common mistakes**: setting a static IP directly in Netplan that conflicts
with the router's DHCP range (causes IP conflicts) — prefer the router-side
reservation instead.

## 4. Create a non-root admin user

**Why**: never administer a box as `root` directly — a separate sudo user
limits blast radius if a session/key is ever compromised, and is required
before we disable root SSH login in the next section.

**Commands** (skip if you already created this user during install):
```bash
sudo adduser admin
sudo usermod -aG sudo admin
```

**Validate success**: `su - admin` then `sudo whoami` returns `root` after
entering the password — confirms sudo works.

**Common mistakes**: forgetting to add the user to the `sudo` group (locks you
out of admin actions); reusing a weak/short password (prefer a passphrase —
you'll switch to key-only SSH right after anyway).

## 5. SSH hardening

**Why**: SSH is the one port staying open to the internet-adjacent LAN/router
in this setup, so it needs to be solid: no root login, no password guessing.

**Commands** (from your own machine, generate a key if you don't have one,
then copy it over):
```bash
ssh-keygen -t ed25519 -C "hitrate-admin"
ssh-copy-id admin@<box-lan-ip>
```
On the box, edit `/etc/ssh/sshd_config`:
```bash
sudo sed -i \
  -e 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' \
  -e 's/^#\?PermitRootLogin.*/PermitRootLogin no/' \
  /etc/ssh/sshd_config
sudo systemctl restart ssh
```
`fail2ban` (installed by [infra/scripts/bootstrap-host.sh](infra/scripts/bootstrap-host.sh)) adds brute-force
protection on top of key-only auth.

**Validate success**: open a **new** terminal (keep your current session open
as a fallback!) and confirm `ssh admin@<box-lan-ip>` still works with the key
and that `ssh admin@<box-lan-ip>` with a wrong/no key now fails. Confirm
`ssh root@<box-lan-ip>` is refused.

**Common mistakes**: disabling password auth *before* confirming key-based
login works — always test in a second session before closing the first,
or you can lock yourself out (physical access would be needed to fix it).

**Security considerations**: keep your private key passphrase-protected on
your own machine; this guide's recommended default is to leave port 22 open
via UFW (simpler) — an optional, more locked-down alternative is tunneling SSH
through Cloudflare (`cloudflared access ssh`) and closing port 22 entirely,
which removes SSH from the internet-facing surface completely but adds setup
complexity on every client machine you administer from. Not required here.

## 6. Firewall setup using UFW

**Why**: with Cloudflare Tunnel, this box never needs an inbound web port —
cloudflared connects *out* to Cloudflare. The only truly needed inbound rule
is SSH.

**Commands** (already run by [infra/scripts/bootstrap-host.sh](infra/scripts/bootstrap-host.sh), shown here
individually for clarity):
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw enable
sudo ufw status verbose
```

**Expected output**:
```
Status: active
To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
```

**Validate success**: from another machine on the same network, `nmap` or
`Test-NetConnection <ip> -Port 80` should show port 80 as **closed/filtered**
(nothing is listening, and nothing should be) — only 22 should respond.

**Common mistakes**: opening 80/443 "just in case" — not needed with Cloudflare
Tunnel, and it reintroduces exactly the exposure this architecture avoids.

## 7. Automatic security updates

**Why**: a home server often doesn't get checked daily — unattended security
patches reduce the window of exposure for known CVEs without you manually
running `apt upgrade` on a schedule.

**Commands** (already run by the bootstrap script):
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
```
This enables `/etc/apt/apt.conf.d/20auto-upgrades` with daily checks. By
default Ubuntu's `50unattended-upgrades` config only applies **security**
updates automatically (not every package upgrade), which is the safe default
— leave it as-is.

**Validate success**: `cat /etc/apt/apt.conf.d/20auto-upgrades` shows
`APT::Periodic::Unattended-Upgrade "1";`. Check logs after a day or two:
`sudo tail -n 50 /var/log/unattended-upgrades/unattended-upgrades.log`.

**Common mistakes**: enabling automatic *reboot* without checking — a reboot
mid-update can be inconvenient for a 24/7 box with no monitor attached; this
guide leaves `Unattended-Upgrade::Automatic-Reboot` at its default (`false`).
If you do want it, schedule it for a low-traffic hour (e.g. 4am) instead.

## 8. Docker installation

**Why**: install Docker Engine from Docker's own apt repository rather than
Ubuntu's `docker.io` package or snap — you get current versions and
security patches faster.

**Commands** (run by [infra/scripts/bootstrap-host.sh](infra/scripts/bootstrap-host.sh)):
```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

**Validate success**: log out/in, then run `docker run hello-world` **without**
`sudo` — it should pull and print "Hello from Docker!".

**Common mistakes**: forgetting to log out/in (or `newgrp docker`) after
`usermod -aG docker` — group membership only applies to new sessions.

**Security considerations**: being in the `docker` group is root-equivalent
(containers can mount the host filesystem) — only your one admin user should
be in it, which is already the case here.

## 9. Docker Compose installation

**Why**: `docker-compose-plugin` (the `docker compose` subcommand, not the
old standalone `docker-compose` binary) ships and updates alongside Docker
Engine itself via the same apt repo — one less thing to track separately.

Already installed in step 8 above (`docker-compose-plugin` is in that same
`apt install` line).

**Validate success**: `docker compose version` prints a `v2.x` version.

**Common mistakes**: installing the old Python `docker-compose` (hyphenated,
v1) from pip — it's deprecated; this guide uses the `docker compose` plugin
syntax throughout.

## 10. Recommended project folder structure

**Why**: keeping the self-host deployment entirely under `infra/` means it
can be copied/cloned onto the box independently of the rest of the repo, and
mirrors the existing repo convention (`infra/Dockerfile` already lived here
for the Railway target).

```
hitrate/
├── backend/                     # FastAPI app (unchanged)
├── frontend/                    # React/Vite SPA (unchanged)
├── .github/workflows/
│   └── docker-publish.yml       # builds + publishes images to GHCR
└── infra/
    ├── backend.Dockerfile       # backend-only image
    ├── frontend.Dockerfile      # frontend-only image (nginx + static build)
    ├── docker-compose.yml       # the 4-service stack
    ├── .env.example             # copy to infra/.env on the box, fill in real values
    ├── nginx/
    │   ├── reverse-proxy.conf   # front door: /api → backend, / → frontend
    │   └── frontend.conf        # SPA static-file serving + fallback
    ├── cloudflared/
    │   ├── config.yml.example   # copy to config.yml, fill in real tunnel id
    │   └── creds/               # gitignored — real tunnel credentials JSON goes here
    ├── scripts/
    │   ├── bootstrap-host.sh    # one-time host setup (UFW, Docker, swap, fail2ban)
    │   ├── deploy.sh            # pull + recreate containers
    │   ├── rollback.sh          # roll back frontend/backend image tag quickly
    │   ├── post-deploy-smoke.sh # runtime smoke checks via nginx (/ + /api)
    │   ├── release-rehearsal.sh # deploy/rollback/redeploy with evidence logs
    │   ├── rehearsal-report.sh  # builds markdown report from rehearsal log
    │   └── backup-db.sh         # nightly pg_dump of Supabase
    └── backups/                 # gitignored — local backup-db.sh output
```

On the box, you only need the `infra/` folder (plus `.git` if you clone the
whole repo, which is simplest for pulling updates to the scripts themselves).

**Validate success**: `tree infra` (or `ls -R infra`) on the box matches the
above.

## 11. Environment variables strategy

**Why**: the backend already reads config via `pydantic-settings`
([backend/app/config.py](backend/app/config.py)) — `DATABASE_URL`, `ODDS_API_KEY`,
`SMALL_SAMPLE_WEEK_THRESHOLD`. Docker Compose has **two** separate mechanisms
that both read the same file here, which is intentional for simplicity:
- Compose **variable substitution** (`${GHCR_OWNER}` etc. in
  [infra/docker-compose.yml](infra/docker-compose.yml)) auto-loads `infra/.env`, but only when you
  run `docker compose` from *inside* `infra/` — always `cd infra` first.
- The `backend` service also loads `infra/.env` directly as **container env**
  via `env_file:`.

**Commands**:
```bash
cd infra
cp .env.example .env
nano .env   # fill in DATABASE_URL (Supabase Session Pooler string), GHCR_OWNER, etc.
chmod 600 .env
```

**Validate success**: `docker compose config` (from inside `infra/`) prints
the fully-resolved compose file with real values substituted — confirms both
mechanisms are reading the file correctly.

**Common mistakes**: running `docker compose` from the repo root instead of
`infra/` — the `${GHCR_OWNER}` substitution silently falls back to empty/blank
and image pulls fail with a confusing "manifest not found" error.

## 12. Secrets management recommendations

**Why**: for a personal project, a `chmod 600` `.env` file that's gitignored
is proportionate security — full secrets managers (Vault, Doppler) are
overkill here, but basic hygiene still matters since this holds your Supabase
connection string.

**Recommendations**:
- `infra/.env` is already gitignored (root [.gitignore](.gitignore)) and should be `chmod 600`.
- Never commit `infra/cloudflared/creds/*.json` (also gitignored) — it's the
  credential that lets anyone run your tunnel.
- Back up both files **off the box** (e.g. in a password manager's "secure
  note"/file attachment, or an encrypted archive) — if the disk dies, you'd
  otherwise have to regenerate the tunnel and re-enter the DB password.
- GHCR images in this guide are **public** (see section 31) specifically so
  the box never needs a GitHub PAT stored on it at all — one less secret to
  manage.

**Common mistakes**: committing a filled-in `.env` by accident — double check
`git status` never lists it; if it ever does get committed, rotate the
Supabase DB password immediately (treat it as leaked).

## 13. Nginx setup

**Why**: nginx is the single internal entry point. It serves two roles,
split across two different nginx instances by design: the `frontend`
container's nginx just serves static files, while the top-level `nginx`
service is a reverse proxy routing between `frontend` and `backend`.

[infra/nginx/frontend.conf](infra/nginx/frontend.conf) (used by the `frontend` image, see section 15):
SPA fallback (`try_files ... /index.html`) so client-side routes (e.g.
`/player/123`) don't 404 on refresh, plus long cache headers for hashed
static assets Vite produces.

**Validate success**: after [section 16](#16-backend-deployment)'s `docker compose up`, run
`docker compose exec frontend nginx -t` — prints `syntax is ok` /
`test is successful`.

## 14. Reverse proxy configuration

**Why**: the frontend ([frontend/src/api.ts](frontend/src/api.ts)) calls the API via a relative
`/api` path, same-origin — so the reverse proxy must route `/api/*` to the
backend and everything else to the frontend, under one hostname.

[infra/nginx/reverse-proxy.conf](infra/nginx/reverse-proxy.conf) does exactly that:
```nginx
location /api/ {
    proxy_pass http://backend:8000;
    ...
}
location / {
    proxy_pass http://frontend:80;
    ...
}
```
Service names (`backend`, `frontend`) resolve via Docker Compose's built-in
DNS on the shared `hitrate_net` network — no IPs to hardcode.

A `limit_req_zone` throttles `/api/` to 10 req/s per IP (burst 20) — cheap
abuse protection appropriate for a low-traffic personal app, not meant to be
a serious WAF.

**Validate success**: `docker compose exec nginx nginx -t`; then from inside
the box, `curl -I http://localhost` should **fail to connect** (no host port
published — this is correct/expected, see section 6). Use
`docker compose exec nginx curl -I http://localhost` instead to test from
inside the Docker network.

**Common mistakes**: proxying to `localhost:8000` instead of `backend:8000`
— container-to-container traffic must use the Compose service name, not
`localhost` (each container has its own network namespace).

## 15. Frontend deployment

**Why**: [infra/frontend.Dockerfile](infra/frontend.Dockerfile) builds the Vite SPA in a throwaway
`node:20-slim` stage, then ships only the static `dist/` output in a tiny
`nginx:1.27-alpine` final image — no Node.js at runtime, smaller image,
smaller attack surface.

This image is built by CI (section 31), not on the box. The box only ever
runs `docker compose pull`.

**Validate success**: `docker compose ps frontend` shows `healthy` (the
Dockerfile's `HEALTHCHECK` curls `/` via `wget`).

**Common mistakes**: trying to `docker compose build` this on the old PC —
possible, but slow; let CI do it (that's the whole point of the GHCR
pull-only workflow).

## 16. Backend deployment

**Why**: [infra/backend.Dockerfile](infra/backend.Dockerfile) is a `python:3.12-slim` image running as a
non-root `appuser`, installing `backend/requirements.txt`, then on container
start running `alembic upgrade head` (applies any pending DB migrations
against Supabase) before starting `uvicorn`.

**Validate success**: `docker compose logs backend` shows the Alembic
migration lines followed by `Uvicorn running on http://0.0.0.0:8000`, and
`docker compose ps backend` shows `healthy`.

**Common mistakes**: forgetting that `alembic upgrade head` runs on *every*
container start — harmless (it's a no-op once migrations are applied) but if
Supabase is unreachable, the backend container will fail to start entirely;
see the troubleshooting section (33) for this exact symptom.

## 17. Docker Compose configuration

**Why**: [infra/docker-compose.yml](infra/docker-compose.yml) ties the 4 services together with no
published host ports and `restart: unless-stopped` everywhere, so the stack
survives both container crashes and host reboots (combined with section 29).

**Commands** (first run, from inside `infra/`, after section 11's `.env` is
filled in):
```bash
cd infra
docker compose pull
docker compose up -d
docker compose ps
```

**Expected output**: four services (`frontend`, `backend`, `nginx`,
`cloudflared`), all `Up` and the three with healthchecks showing `healthy`
after ~30s (`cloudflared` has no healthcheck defined — its own logs are the
signal, see section 20).

**Validate success**: `docker compose logs -f` shows no restart loops;
`docker compose ps` shows all 4 containers running.

**Common mistakes**: running this from the repo root instead of `infra/` (see
section 11) — `${GHCR_OWNER}` won't resolve.

## 18. Cloudflare account setup

**Why**: Cloudflare is both the DNS host and the tunnel provider here — one
account covers domain management, DNS, and the free Tunnel product.

**Steps**: sign up at Cloudflare (free plan is enough), then **Add a site**
(your domain, picked in section 19) — Cloudflare scans existing DNS records
and gives you two nameservers to set at your registrar.

**Validate success**: after updating nameservers at your registrar (takes
minutes to ~24h to propagate), the Cloudflare dashboard shows the domain as
**Active**.

**Common mistakes**: trying to configure the Tunnel before the domain shows
Active in Cloudflare — DNS routing (section 19) needs the zone to be live.

## 19. Domain configuration

**Why**: `hitrate.app` was the recommended pick (short, memorable, the
`.app` TLD is on the HSTS preload list so browsers force HTTPS even before
the first request — a nice free hardening win that fits this security-first
setup). `gethitrate.com` is the fallback if `.app` isn't available.

**Steps**: buy the domain at any registrar (Cloudflare Registrar is a good
option since it's at-cost pricing and integrates with the rest of this setup
with zero extra steps), then point its nameservers at the two Cloudflare
gave you in section 18.

**Validate success**: `dig NS hitrate.app` (or whatever domain you chose)
returns Cloudflare's nameservers.

**Common mistakes**: buying the domain at a different registrar and
forgetting to actually update the nameservers (defaults usually point at the
registrar's own parking page).

## 20. Cloudflare Tunnel installation

**Why**: `cloudflared` is the agent that creates the outbound-only tunnel
from this box to Cloudflare's edge — it's what lets us skip port forwarding
on the router entirely.

This guide runs `cloudflared` **as a container** (already wired into
[infra/docker-compose.yml](infra/docker-compose.yml)), so there's nothing to install on the host OS
itself — only the one-time `cloudflared` CLI commands below (section 21) need
a temporary local install, or can be run via the official Docker image too:
```bash
docker run --rm -it -v "$PWD/infra/cloudflared:/home/nonroot/.cloudflared" \
  cloudflare/cloudflared:latest tunnel login
```

**Validate success**: the command prints a Cloudflare login URL; after
authorizing in a browser, a `cert.pem` appears in `infra/cloudflared/`.

## 21. Tunnel creation

**Commands**:
```bash
docker run --rm -it -v "$PWD/infra/cloudflared:/home/nonroot/.cloudflared" \
  cloudflare/cloudflared:latest tunnel create hitrate
```

**Expected output**: prints a tunnel UUID and the path to a generated
credentials JSON file (`<TUNNEL_ID>.json`).

**Steps after**: move that JSON into `infra/cloudflared/creds/` (already
gitignored — see section 12), and note the `<TUNNEL_ID>` for section 22.

**Validate success**: `ls infra/cloudflared/creds/` shows the `.json` file.

**Common mistakes**: committing the generated credentials file — it's
equivalent to a password for your tunnel; double-check `git status`.

## 22. Tunnel configuration

**Why**: [infra/cloudflared/config.yml.example](infra/cloudflared/config.yml.example) defines which hostname
routes to which internal service.

**Commands**:
```bash
cp infra/cloudflared/config.yml.example infra/cloudflared/config.yml
# edit: replace <TUNNEL_ID> (both lines) and the hostname with your real domain
```
```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/creds/<TUNNEL_ID>.json
ingress:
  - hostname: hitrate.app
    service: http://nginx:80
  - service: http_status:404
```

**Validate success**: `docker compose config` (from `infra/`) shows the
`cloudflared` service with both volumes mounted correctly.

**Common mistakes**: forgetting the final catch-all `- service: http_status:404`
line — cloudflared refuses to start without one.

## 23. Connecting the tunnel to Nginx

**Why**: this is just the `ingress` rule above (`service: http://nginx:80`)
— `nginx` resolves via Compose's internal DNS since both containers share the
`hitrate_net` network.

**Commands**:
```bash
cd infra
docker run --rm -it -v "$PWD/cloudflared:/home/nonroot/.cloudflared" \
  cloudflare/cloudflared:latest tunnel route dns hitrate hitrate.app
docker compose up -d cloudflared
docker compose logs -f cloudflared
```

**Expected output**: logs show `Registered tunnel connection` (typically 2-4
connections to different Cloudflare edge locations, for redundancy).

**Validate success**: Cloudflare dashboard → Zero Trust → Networks → Tunnels
shows `hitrate` as **Healthy**.

**Common mistakes**: running `tunnel route dns` before the domain is Active
in Cloudflare (section 18/19) — it'll fail to create the CNAME.

## 24. HTTPS validation

**Why**: confirm the whole chain (browser → Cloudflare edge TLS → tunnel →
nginx → frontend/backend) actually works end-to-end.

**Commands**:
```bash
curl -I https://hitrate.app
curl -I https://hitrate.app/api/health
```

**Expected output**: `HTTP/2 200`, and response headers include
`server: cloudflare` — confirms Cloudflare is terminating TLS in front of you.

**Validate success**: open `https://hitrate.app` in a browser — padlock icon,
certificate issued to Cloudflare, the HitRate UI loads.

**Common mistakes**: In the Cloudflare dashboard, under SSL/TLS, the
encryption mode (Flexible/Full/Full Strict) only matters for *classic*
reverse-proxied traffic to an origin IP — with Tunnel, Cloudflare connects to
your origin *through* the tunnel itself, so this setting has no bearing on
your setup; don't spend time tuning it. If you see mismatched content/redirect
loops, check `Always Use HTTPS` is enabled instead (routes plain-HTTP visitors
to HTTPS at the edge).

## 25. Logging strategy

**Why**: for a personal project, centralized log aggregation (ELK, Loki) is
overkill — `docker compose logs` plus basic log rotation is proportionate.

**Commands**:
```bash
docker compose logs -f                 # tail all services
docker compose logs -f backend         # just one
```
Cap Docker's own log growth (add to `/etc/docker/daemon.json`):
```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```
```bash
sudo systemctl restart docker
```

**Validate success**: `docker inspect backend | grep -A3 LogConfig` shows the
new `max-size`/`max-file` values (requires the container to be recreated
after the daemon restart to pick up the new default).

**Common mistakes**: never rotating logs — on a disk this size (174GB) it's
not urgent, but unbounded `json-file` logs are still a classic "disk silently
fills up" failure mode worth closing off up front.

## 26. Monitoring strategy

**Why**: you want to know the site is down before a user tells you, without
running a full observability stack (Prometheus/Grafana is real overkill at
this traffic level — mentioned only as a future option in section 35).

**Recommendation**: a free external uptime checker — UptimeRobot or
healthchecks.io — pinging `https://hitrate.app/api/health` every 5 minutes,
alerting by email (or a free Discord/Slack webhook) on failure.

**Validate success**: temporarily stop the stack (`docker compose stop nginx`)
and confirm you get an alert within the configured interval, then
`docker compose start nginx`.

**Common mistakes**: monitoring only `https://hitrate.app/` — that's served by
the `frontend` container and can look "up" even if `backend`/Supabase is
down; also check `/api/health` specifically (and note today it returns a
static `{"status":"ok"}` without touching the DB — see section 28 for the
real DB-reachability check).

## 27. Backup strategy

**Why**: Supabase already backs up your Postgres data, but an extra,
independent nightly dump costs nothing and protects against mistakes made
*inside* Supabase (accidental `DROP TABLE`, bad migration, etc.) that
Supabase's own point-in-time recovery window might not cover depending on
your plan.

[infra/scripts/backup-db.sh](infra/scripts/backup-db.sh) does `pg_dump` + gzip, keeping 14 days of
history, installed via cron:
```bash
crontab -e
# add:
0 3 * * * /home/admin/hitrate/infra/scripts/backup-db.sh >> /home/admin/hitrate/infra/backups/cron.log 2>&1
```

**Validate success**: run it manually once (`./infra/scripts/backup-db.sh`),
confirm a `hitrate-YYYY-MM-DD.sql.gz` appears in `infra/backups/`, and that
`gunzip -t` on it reports no errors.

**Common mistakes**: only backing up the DB and forgetting `.env` +
`infra/cloudflared/creds/` (see section 12) — those aren't in git and aren't
in Supabase either; losing the disk loses them unless backed up separately.

## 28. Supabase connectivity validation

**Why**: confirm the box can actually reach Supabase before trusting
anything else — most "backend won't start" issues trace back to this.

**Commands**:
```bash
docker compose exec backend python -c "
from app.db import SessionLocal
from sqlalchemy import text
db = SessionLocal()
print(db.execute(text('select 1')).scalar())
db.close()
"
```

**Expected output**: `1`.

**Validate success**: that one-liner returning `1` confirms the
`DATABASE_URL` (Session Pooler string, per
[backend/app/config.py](backend/app/config.py)) is correct and the network path to Supabase is
open.

**Common mistakes**: using the **direct connection** string instead of the
**Session Pooler** string from Supabase — direct IPv6 connections are known
not to work from this network (see
[.github/copilot-instructions.md](.github/copilot-instructions.md)); always use the pooler string shown
under Supabase → Project Settings → Database → Connection string → "Session
pooler".

## 29. Automatic startup after reboot

**Why**: the box runs 24/7, but power blips happen — the stack must come
back up unattended.

**Already handled by**:
- `sudo systemctl enable docker` (run in section 8/bootstrap script) — Docker
  daemon starts on boot.
- `restart: unless-stopped` on every service in
  [infra/docker-compose.yml](infra/docker-compose.yml) — Docker restarts containers automatically,
  including after a host reboot, as long as they weren't manually stopped
  before the reboot.

**Validate success**: `sudo reboot`, wait ~1 minute, then `ssh` back in and
run `docker compose ps` — all 4 services should already be `Up` with no
manual `docker compose up` needed.

**Common mistakes**: using `restart: always` thinking it's stronger — the
practical difference is `unless-stopped` also respects a manual
`docker compose stop`, which is almost always what you want (you don't want a
container you deliberately stopped to come back on the next reboot).

## 30. Application update process

**Why**: deploying a new version should be as close to zero-touch as
possible, given the 36-step nature of this whole setup — once it's running,
day-to-day updates should be one command.

**Commands** (manual path — always available even with CI auto-deploy wired
up in section 31):
```bash
cd ~/hitrate/infra
./scripts/deploy.sh
```
This runs `docker compose pull && docker compose up -d --remove-orphans`,
prunes dangling images, and executes
`scripts/post-deploy-smoke.sh` (API + SPA routing checks through nginx). Only
containers whose image actually changed get recreated; `alembic upgrade head`
re-runs automatically on backend start (harmless no-op if there's nothing new
to migrate).

**Validate success**: the script exits 0, `[smoke] all smoke checks passed`
appears in output, `docker compose images` shows updated `CREATED` timestamps
for images that changed, and `docker compose logs backend` shows the Alembic
line confirming a clean restart.

**Common mistakes**: manually `docker pull`-ing individual images instead of
using `docker compose pull` — works, but skips the `--remove-orphans`/compose
bookkeeping `deploy.sh` does for you; just use the script.

## 31. CI/CD recommendations using GitHub Actions

**Why**: building images on the old PC is slow (see section 1); building them
in GitHub Actions on every push to `main` and publishing to GHCR means the
box only ever does a fast `pull`.

[.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml) does this in two jobs:
1. `build-and-push` (matrix over `frontend`/`backend`) — builds both images
   with `docker/build-push-action` and pushes to
   `ghcr.io/<owner>/hitrate-frontend` / `hitrate-backend`, tagged `latest` and
   the commit SHA.
2. `deploy` — runs on a **self-hosted runner you install on the box itself**,
   so it polls GitHub outbound (no inbound port needed) and simply calls
   `infra/scripts/deploy.sh` after a successful build.

**One-time setup for the self-hosted runner** (GitHub repo → Settings →
Actions → Runners → New self-hosted runner → follow the generated commands on
the box, then):
```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

**GHCR packages should be set to Public** (repo → Packages →
`hitrate-frontend`/`hitrate-backend` → Package settings → Change visibility)
so `docker compose pull` on the box needs zero authentication.

**Validate success**: push a commit to `main`, watch the Actions tab — both
jobs go green, and within ~1-2 minutes `docker compose ps` on the box shows
freshly recreated containers with a newer `CREATED` time.

**Common mistakes**: leaving GHCR packages private and then being surprised
`docker compose pull` fails with `unauthorized` on the box — either make them
public (recommended here) or set up `docker login ghcr.io` with a
read-only PAT on the box (extra secret to manage, avoided by this guide).

## 31.1 Rollback procedure (fast path)

**Why**: when a deploy regresses behavior, recovery should be one command and
must include a post-rollback health check.

Use [infra/scripts/rollback.sh](infra/scripts/rollback.sh):

```bash
cd ~/hitrate/infra
chmod +x scripts/rollback.sh   # one-time
./scripts/rollback.sh <previous-image-tag>
```

Examples:
- `./scripts/rollback.sh e00cb7d`
- `./scripts/rollback.sh latest` (not ideal, only for emergencies)

How to choose `<previous-image-tag>`:
1. Prefer a known-good Git commit SHA tag published by CI.
2. Keep a short release note in your ops log with deployed SHA per rollout.

**Validate success**:
1. Script exits 0.
2. Smoke output includes `[smoke] all smoke checks passed`.
3. `docker compose ps` shows backend/frontend `Up`.
4. `curl -I https://hitrate.app/api/health` returns `200`.

## 31.2 Release rehearsal with evidence

**Why**: before declaring release-readiness complete, run one full rehearsal
cycle (deploy -> rollback -> deploy) and keep a timestamped artifact with
all command output.

Use [infra/scripts/release-rehearsal.sh](infra/scripts/release-rehearsal.sh):

```bash
cd ~/hitrate/infra
chmod +x scripts/release-rehearsal.sh   # one-time
./scripts/release-rehearsal.sh <known-good-rollback-tag> [forward-tag]
```

Examples:
- `./scripts/release-rehearsal.sh e00cb7d`
- `./scripts/release-rehearsal.sh e00cb7d 1f6b805`

Output:
- A log file is created under `infra/rehearsals/` with a timestamped name.
- The log contains deploy, rollback, post-deploy smoke output, and final
  `docker compose ps` status.

**Validate success**:
1. Script exits 0.
2. Output ends with `[rehearsal] COMPLETE`.
3. Evidence file exists in `infra/rehearsals/`.

To generate a concise markdown artifact from the raw log:

```bash
./scripts/rehearsal-report.sh ./rehearsals/release_rehearsal_<timestamp>.log
```

This writes `./rehearsals/release_rehearsal_<timestamp>.md` with:
- pass/fail summary
- all rehearsal step outcomes
- smoke check lines
- final `docker compose ps` section

## 32. Security best practices

Recap/checklist of everything above, in one place:
- [ ] No inbound ports besides SSH (22) — verified with an external port scan.
- [ ] SSH: key-only, no root login, `fail2ban` active.
- [ ] UFW default-deny incoming, enabled on boot.
- [ ] `unattended-upgrades` installed, security-only.
- [ ] `infra/.env` is `chmod 600` and gitignored; never committed.
- [ ] `infra/cloudflared/creds/` gitignored; backed up off-box separately.
- [ ] Backend container runs as non-root `appuser`
  ([infra/backend.Dockerfile](infra/backend.Dockerfile)).
- [ ] GHCR images public (intentional, zero-secret pulls) — acceptable since
  the Dockerfiles/source are already public in this repo; never put real
  secrets *in* an image layer, only ever inject them at runtime via `.env`.
- [ ] `DATABASE_URL` uses the Supabase Session Pooler string, not a direct
  connection with a weak/shared password.
- [ ] Docker log rotation configured (section 25) so logs can't fill the disk.

## 33. Common troubleshooting scenarios

| Symptom | Likely cause | Fix |
|---|---|---|
| `docker compose ps` shows a service restarting in a loop | Check `docker compose logs <service>` first — almost always a config/env error | Fix the root cause shown in logs; for `backend`, see the Supabase scenario below |
| Backend container exits right after `alembic upgrade head` | Supabase unreachable or wrong `DATABASE_URL` | Re-check the Session Pooler string (section 28); confirm the box has internet egress |
| `https://hitrate.app` shows a Cloudflare error page (523/502) | Tunnel is down, or nginx/frontend/backend aren't healthy | `docker compose logs cloudflared`; check Tunnel status in the Cloudflare dashboard; `docker compose ps` for unhealthy containers |
| 502 from nginx specifically (not a Cloudflare error page) | nginx is up but `backend`/`frontend` upstream isn't | `docker compose logs backend` / `frontend`; confirm service names in [reverse-proxy.conf](infra/nginx/reverse-proxy.conf) match compose service names exactly |
| `docker compose pull` fails with `unauthorized` | GHCR package is private | Make the package public (section 31) or `docker login ghcr.io` |
| Site works on LAN but not publicly | DNS not yet propagated, or tunnel route never created | `dig hitrate.app` should show a Cloudflare-proxied CNAME; re-run `tunnel route dns` (section 23) |
| Disk filling up over time | Unbounded container logs | Apply the `daemon.json` log rotation (section 25) |
| Locked out of SSH after hardening | Key not actually installed, or hardening applied before testing | Recover via physical keyboard/monitor access on the box, re-check `~/.ssh/authorized_keys` for the `admin` user |

## 34. Performance optimization recommendations

- Both images already use `-slim`/`-alpine` bases — keep it that way, don't
  swap to full `python:3.12` or `nginx:latest` (bigger, slower pulls on a
  residential connection).
- `gzip` is enabled in [reverse-proxy.conf](infra/nginx/reverse-proxy.conf) for text/JSON/JS/CSS — reduces
  bandwidth for the API responses this app serves heavily (board/trends
  JSON payloads).
- Static asset caching (`expires 7d`) in [frontend.conf](infra/nginx/frontend.conf) means repeat
  visitors re-download almost nothing after the first load.
- The existing in-process `@ttl_cache` layer in the backend (see
  [.github/copilot-instructions.md](.github/copilot-instructions.md) "Performance" section) already avoids
  most repeated expensive Supabase round-trips — nothing new needed here, it
  works the same in Docker as it does today.
- The 2GB swap file (section 2) is cheap insurance against OOM kills on
  unconfirmed/low RAM — if `free -h` shows swap usage climbing steadily
  (not just spiking), that's a sign to check for a memory leak rather than
  just adding more swap.

## 35. Scaling strategy if the project grows

Current setup intentionally runs **one** `backend` replica — the in-process
`APScheduler` in [backend/app/main.py](backend/app/main.py) (`start_scheduler`) runs ETL jobs on a
timer *inside* the backend process. Running 2+ replicas today would mean 2+
schedulers independently re-running the same ETL/ingest jobs — duplicate
work, not more throughput.

**Path to scale, in order**:
1. Extract the scheduler into its own separate container/cron job (it already
   just calls `SPORTS[adapter].ingest_all()`/`refresh_scores()` — these are
   pure functions, not tied to serving HTTP requests) so `backend` becomes a
   stateless API-only process.
2. Then scale horizontally with `docker compose up -d --scale backend=N`, and
   add an `upstream` block with multiple `backend` entries in
   [reverse-proxy.conf](infra/nginx/reverse-proxy.conf).
3. If the old PC's bandwidth, power reliability, or raw capacity become the
   actual bottleneck (not just backend replica count), migrate the same
   Docker Compose stack as-is to a small VPS (the images/compose file don't
   change) — this is a low-effort move specifically because everything here
   is already containerized and stateless.
4. Only at real scale would Prometheus/Grafana-style monitoring (skipped in
   section 26) start to pay for itself.

## 36. Estimated monthly operational cost

| Item | Cost |
|---|---|
| Domain (`hitrate.app`, amortized) | ~$1-2/mo |
| Electricity (old APU box, 24/7, rough estimate — measure with a watt-meter for precision) | ~$2-8/mo depending on local electricity rates |
| Cloudflare (DNS + Tunnel) | $0 (free plan) |
| GHCR (public image hosting) | $0 (free for public packages) |
| GitHub Actions (public repo build minutes) | $0 (free for public repos) |
| Supabase | whatever tier you're already on — unrelated to this deployment |
| **Total (excluding Supabase)** | **~$3-10/month** |

---

## Quick start summary (once everything above is understood)

```bash
# On the box, one time:
git clone https://github.com/aRubioMDC/hitrate.git ~/hitrate
cd ~/hitrate
bash infra/scripts/bootstrap-host.sh   # logout/login after this
cd infra
cp .env.example .env && nano .env && chmod 600 .env
cp cloudflared/config.yml.example cloudflared/config.yml && nano cloudflared/config.yml
# (run the `cloudflared tunnel login` / `create` / `route dns` commands from sections 20-23)
docker compose pull
docker compose up -d
docker compose ps   # confirm all 4 healthy
curl -I https://hitrate.app   # confirm HTTPS end-to-end

# Day to day, after pushing to main (CI builds+publishes automatically):
./scripts/deploy.sh

# Optional standalone runtime verification after deploy/rollback:
./scripts/post-deploy-smoke.sh
```
