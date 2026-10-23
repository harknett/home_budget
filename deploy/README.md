# Deploying Home Budget

One Node process behind a reverse proxy, run by systemd as its own user, with
a SQLite file for state. It is built for a small VPS — one vCPU and 1 GB of RAM
is enough for a household.

- [Ports on a shared host](#ports-on-a-shared-host)
- [What the unit expects](#what-the-unit-expects)
- [Environment](#environment)
- [First install](#first-install)
- [Creating the first account](#creating-the-first-account)
- [Reverse proxy and TLS](#reverse-proxy-and-tls)
- [Upgrading](#upgrading)
- [Backups and restore](#backups-and-restore)
- [Troubleshooting](#troubleshooting)

## Ports on a shared host

These services sit behind one reverse proxy on one machine, so each takes a
different loopback port. Whichever two share a port, the second to start dies
with EADDRINUSE.

| Service | Port |
| --- | --- |
| schedule-f-books | 3000 |
| eden-planner | 3001 |
| tricklingspring | 3002 |
| jms-crm | 3003 |
| _reserved: headache_diary_ | 3004 |
| _reserved: the_eights_ | 3005 |
| garage-wod-tracker | 3006 |
| **home_budget** | **3007** |

Change a port with a drop-in rather than by editing the shipped unit, so an
upgrade does not overwrite the change:

```bash
sudo systemctl edit home-budget
#   [Service]
#   Environment=PORT=3008
```

## What the unit expects

Nothing below is created automatically except the state directory.

| Thing | Notes |
| --- | --- |
| `home-budget` user and group | System account, no login shell. |
| `/opt/home-budget` | The build. Read-only to the service. |
| `/var/lib/home-budget` | Created by `StateDirectory=` at 0700 on first start. Holds `budget.db`. |

The account is created as the first step of [First install](#first-install);
it is listed here so the unit's requirements are in one place.

Node 22 or newer is required: the app uses the built-in `node:sqlite`, so there
is no native module to compile and nothing to rebuild when Node is upgraded.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | 3000 | The unit sets 3007 — see the port table. |
| `HOSTNAME` | all interfaces | The unit sets 127.0.0.1. The standalone server honours this; `next start` does not. |
| `DATA_DIR` | `./data` | The unit points this at `/var/lib/home-budget`. |
| `SETUP_TOKEN` | unset | Enables the one-time first-account page. Set it only while creating the owner login, then remove it. |

`SETUP_TOKEN` is a credential while it is set and must not go in the shipped
unit, which is world-readable in `/etc/systemd/system`. Use a root-owned
drop-in, as shown under [Creating the first account](#creating-the-first-account).

## First install

`output: "standalone"` emits a server that runs without `node_modules`, which
is why `/opt` can be mounted read-only. Next does **not** copy the static
assets into that output, so they are copied by hand.

```bash
# The unit runs as its own system account. Create it FIRST: without it the
# service never reaches node and dies with `status=217/USER`, which reads like
# a permissions problem and is really a missing user.
sudo useradd --system --no-create-home --shell /usr/sbin/nologin home-budget
getent group home-budget || sudo groupadd --system home-budget

git clone https://github.com/harknett/home_budget.git
cd home_budget
npm ci
npm run build

sudo rsync -a --delete .next/standalone/ /opt/home-budget/
sudo rsync -a .next/static/ /opt/home-budget/.next/static/
sudo chown -R root:root /opt/home-budget

sudo cp deploy/home-budget.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now home-budget
```

Forgetting the `.next/static` copy gives a page that loads with no styles and
no interactivity, and logs nothing — the server is fine, the browser is 404ing
on assets. It is the most common bad deploy of this app.

The database is created and migrated on first request. There is no migration
command to run.

## Creating the first account

The first account is the owner, and it is claimed through `/setup` — which only
works while the database holds no accounts **and** `SETUP_TOKEN` is set. A
standing token is an open invitation, so it is a door you open and close:

```bash
sudo systemctl edit home-budget
#   [Service]
#   Environment=SETUP_TOKEN=<paste output of: openssl rand -hex 16>
sudo systemctl restart home-budget
```

Visit `https://your-host/setup`, create the owner login, then remove the
token and restart. After that the owner adds everyone else from **More → Household logins**;
each new login gets a one-time password shown once on screen and must choose
its own at first sign-in.

## Reverse proxy and TLS

The service binds loopback and speaks plain HTTP. Session cookies are `Secure`
in production, so **the app does not work over plain HTTP from a browser** —
you can sign in, the cookie is dropped, and you land back on the login form
with no error. TLS in front is required, not optional.

### Before you start

| Need | Check |
| --- | --- |
| A name pointing at the server | `dig +short budget.example.com` returns your public IP |
| Ports 80 and 443 open | `sudo ufw allow 'Nginx Full'`, or your provider's firewall |
| The app running on loopback | `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3007/login` → `307` or `200` |

Port 80 has to stay reachable even after you are on HTTPS: that is how renewal
proves the domain every 60 days.

### 1. Install

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

### 2. A plain HTTP server block first

Certbot needs a working HTTP site to prove you control the name. Write
`/etc/nginx/sites-available/home-budget`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name budget.example.com;

    location / {
        proxy_pass http://127.0.0.1:3007;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

Enable it and check the syntax before reloading — `nginx -t` is the difference
between a typo and an outage:

```bash
sudo ln -s /etc/nginx/sites-available/home-budget /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default     # it otherwise answers for every name
sudo nginx -t && sudo systemctl reload nginx
```

Confirm the site answers over HTTP before going further:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://budget.example.com/login
```

### 3. Get the certificate

```bash
sudo certbot --nginx -d budget.example.com
```

Certbot edits the file you just wrote: it adds a `listen 443 ssl` block, the
`ssl_certificate` lines, and a second server block redirecting port 80 to
HTTPS. Answer "redirect" when it offers.

If you would rather it never touched your config, use the webroot method and
write the TLS block yourself:

```bash
sudo certbot certonly --webroot -w /var/www/html -d budget.example.com
```

### 4. The finished server block

Certbot's version works, but it does not know anything about this app. Replace
the `location /` with the following — the comments are the parts that matter:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    # nginx 1.25.1 and newer. On Debian 12 (1.22) and Ubuntu 24.04 (1.24) this
    # directive does not exist — drop this line and write `listen 443 ssl http2;`
    # instead. Check with `nginx -v` before pasting.
    http2 on;
    server_name budget.example.com;

    ssl_certificate     /etc/letsencrypt/live/budget.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/budget.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3007;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        # $remote_addr, NOT $proxy_add_x_forwarded_for. The app throttles
        # sign-ins per address and trusts this header, so nginx must overwrite
        # whatever the client sent rather than append to it — otherwise anyone
        # can send their own header and hand themselves a fresh allowance of
        # guesses.
        proxy_set_header X-Forwarded-For   $remote_addr;
    }
}
```

That is the whole file on purpose. Two things people usually add here are
already handled upstream, and adding them again makes things worse rather than
better:

| Tempting addition | Why it is left out |
| --- | --- |
| A `/_next/static/` block with long `Cache-Control` | Next already answers those with `public, max-age=31536000, immutable`. `add_header` **appends**, so you would send the header twice. |
| `gzip on` | Next compresses its own responses; nginx will not re-compress something already gzipped. |

Check for yourself rather than taking it on faith:

```bash
curl -sSI https://budget.example.com/_next/static/chunks/<any-file>.css | grep -i 'cache-control\|content-encoding'
```

**Do not add security headers here.** The app already sets its own
Content-Security-Policy, HSTS, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy` and `Permissions-Policy`. A second CSP from nginx is not
merged — browsers enforce *both*, so the intersection wins, and since nginx's
copy would not carry the per-request nonce, every inline script gets blocked
and the app renders perfectly while doing nothing at all. If you want to see
what is already being sent:

```bash
curl -sSI https://budget.example.com/login | grep -i -E 'content-security|strict-transport|x-frame'
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 5. Check renewal before you forget about it

The package installs a systemd timer that renews anything within 30 days of
expiry. Prove it works now rather than discovering it in 90 days:

```bash
systemctl list-timers | grep certbot        # the timer exists and is scheduled
sudo certbot renew --dry-run                # a real renewal against the staging CA
```

A dry run that fails on the HTTP-01 challenge almost always means port 80 is
closed, or the redirect to HTTPS is swallowing
`/.well-known/acme-challenge/`. Certbot's own redirect block handles that
correctly; a hand-written one often does not.

### Verifying the whole path

```bash
curl -sS -o /dev/null -w 'http  -> %{http_code} %{redirect_url}\n' http://budget.example.com/
curl -sS -o /dev/null -w 'https -> %{http_code}\n'                 https://budget.example.com/login
curl -sSI https://budget.example.com/login | grep -i 'set-cookie\|content-security'
```

You want: HTTP answering 301 to HTTPS, HTTPS answering 200 on `/login`, and a
`Set-Cookie` you only ever see once signed in. Then open it in a browser and
sign in — if the form simply returns to itself, the cookie is being dropped,
which means something in the chain is still plain HTTP.

### When it goes wrong

| Symptom | Cause |
| --- | --- |
| `502 Bad Gateway` | The app is not running, or not on 3007. `systemctl status home-budget` |
| Sign-in returns to the sign-in form | Reached over plain HTTP somewhere; the `Secure` cookie never comes back. |
| Page loads unstyled and nothing is clickable | Either `.next/static` was not copied on deploy, or nginx is adding a second CSP. |
| Too many sign-in lockouts, or none | `X-Forwarded-For` is appended rather than overwritten, so the throttle keys on a spoofable value. |
| Certificate renews but the site still serves the old one | nginx was not reloaded. Add `--deploy-hook "systemctl reload nginx"` to the renewal. |

## Upgrading

Upgrades are a rebuild and a file swap. The database migrates itself on the
next request, so the ordering is: back up, build, swap, restart.

```bash
cd ~/home_budget
git pull

# 1. Back up first. Migrations run automatically and are not reversible.
sudo systemctl stop home-budget
sudo cp /var/lib/home-budget/budget.db ~/budget-$(date +%F).db

# 2. Build the new version.
npm ci
npm run build
npm test

# 3. Swap it in. --delete removes files the new version dropped; the database
#    is untouched because it lives in /var/lib, not /opt.
sudo rsync -a --delete .next/standalone/ /opt/home-budget/
sudo rsync -a .next/static/ /opt/home-budget/.next/static/
sudo chown -R root:root /opt/home-budget

# 4. Start, and check it came back.
sudo systemctl start home-budget
systemctl status home-budget --no-pager
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3007/login
```

Stopping before the copy matters: `rsync --delete` over a running server pulls
chunks out from under it, and the requests in flight fail with
module-not-found errors that look like a build problem rather than a deploy one.

If the shipped unit file changed in the release, copy it again and
`daemon-reload`. Drop-ins under
`/etc/systemd/system/home-budget.service.d/` survive that, which is why
any port override belongs there.

### Rolling back

```bash
sudo systemctl stop home-budget
git checkout <previous-tag>
npm ci && npm run build
sudo rsync -a --delete .next/standalone/ /opt/home-budget/
sudo rsync -a .next/static/ /opt/home-budget/.next/static/
sudo cp ~/budget-<date>.db /var/lib/home-budget/budget.db
sudo chown home-budget:home-budget /var/lib/home-budget/budget.db
sudo systemctl start home-budget
```

Restore the database only if the new version had already migrated it. A schema
from a newer version will not load under older code, and that is the one
failure a rollback cannot talk its way out of.

## Backups and restore

The whole application is one SQLite file. Back it up while the service is
stopped, or use `sqlite3 .backup`, which is safe against a running writer:

```bash
sudo -u home-budget sqlite3 /var/lib/home-budget/budget.db \
  ".backup '/var/backups/budget-$(date +%F).db'"
```

A plain `cp` of a running database can catch it mid-write and miss the WAL. The
unit closes SQLite on SIGTERM and checkpoints the WAL, so a copy taken while
the service is stopped is one complete file.

Nightly, via cron:

```cron
15 3 * * * sudo -u home-budget sqlite3 /var/lib/home-budget/budget.db ".backup '/var/backups/budget-$(date +\%F).db'" && find /var/backups -name 'budget-*.db' -mtime +30 -delete
```

Restoring is a file copy back, with the service stopped and ownership fixed
afterwards.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `status=217/USER`, restarting in a loop | The `home-budget` user or group does not exist. systemd gives up before running node, so there is nothing in the app's log. `sudo useradd --system --no-create-home --shell /usr/sbin/nologin home-budget` |
| `status=203/EXEC` | Node is not at `/usr/bin/node` (`command -v node`), or `/opt/home-budget/server.js` is missing because the rsync did not run. |
| `status=226/NAMESPACE` | The confinement cannot set up a path the unit names — usually `WorkingDirectory` does not exist yet. |
| Starts, then exits with `SQLITE_CANTOPEN` | `DATA_DIR` is not writable by the service user, or `StateDirectory=` was overridden by a drop-in. |
| Page loads unstyled, nothing clickable | `.next/static` was not copied. Re-run that rsync. |
| `EADDRINUSE` on start | Another service holds 3007. See the port table. |
| Sign-in rejects a known-good password | The app is being reached over plain HTTP; the session cookie is `Secure` and never comes back. |
| `/setup` says setup is closed | `SETUP_TOKEN` is unset, or an account already exists. |
| Build screen says generation is off | `SQLITE_CANTOPEN` | `DATA_DIR` is not writable by the service user, or `StateDirectory=` was overridden. |

```bash
systemctl status home-budget --no-pager
journalctl -u home-budget -n 100 --no-pager
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3007/login
```
