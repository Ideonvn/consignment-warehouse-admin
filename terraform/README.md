# Infrastructure — the admin portal on AWS Amplify

Hosting for `https://admin.consignment-warehouse.com`. A reusable module in
`shared/modules/amplify`, and a root in `deployment/` that calls it once.

| | |
| --- | --- |
| AWS account | `982055099067` |
| Region | `eu-west-1` (Ireland) |
| Origin | `https://admin.consignment-warehouse.com` |
| API it talks to | `https://api.consignment-warehouse.com` (af-south-1, Docker Swarm, TLS via Caddy) |
| Repository | `https://github.com/Ideonvn/consignment-warehouse-admin` (private) |

The bidder app takes the apex, `https://consignment-warehouse.com`, and is
deployed from its own repository. **Nothing here touches it.**

## Why `eu-west-1` and not af-south-1

Amplify Hosting is not offered in af-south-1, so the portal cannot sit beside the
API however much one would like it to. Ireland is the closest well-connected
region that does offer it — the west-coast submarine cables out of South Africa
land in Europe, making Dublin a shorter round trip from Johannesburg than any US
region and roughly level with Frankfurt. The full reasoning is in
`deployment/variables.tf`; do not change the region without reading it.

It matters less than it looks. Static assets come off CloudFront edges, which
include Johannesburg and Cape Town; every API and WebSocket call goes from the
browser straight to af-south-1 without passing through Amplify. Only a hard load
of a server-rendered route crosses regions — see the root README's *Rendering*
section for what that costs.

## Applying

State is remote, in the same S3 bucket the backend uses, under the key
`admin-portal/terraform.tfstate`. The bucket is a chicken-and-egg and is **not**
created by this configuration; the backend repo covers creating it.
`use_lockfile = true` is native S3 locking, so there is no DynamoDB table.

```bash
cd terraform/deployment
cp terraform.tfvars.example terraform.tfvars   # fill in; never commit
terraform init
terraform plan
terraform apply
```

`terraform.tfvars`, `*.tfstate*` and `.terraform/` are ignored.
`terraform.tfvars.example` and `.terraform.lock.hcl` are committed on purpose —
the lock file pins provider hashes.

## Connecting the private repository

The repository is private and stays private, so Amplify needs a GitHub
connection to clone it and to receive push webhooks. There are two supported
shapes, and the provider documents both:

> If you create a new Amplify App with the `repository` argument, you also need
> to set `oauth_token` or `access_token` for authentication.
>
> You can omit `access_token` if you import an existing Amplify App created by
> the Amplify Console (using OAuth for authentication).
>
> — [`aws_amplify_app` provider documentation](https://registry.terraform.io/providers/hashicorp/aws/5.82.2/docs/resources/amplify_app)

**Take the second one.** A PAT passed as a Terraform variable is written into
state; AWS itself does not keep it (*"The token is not stored"*, per the same
docs, for both `access_token` and `oauth_token`), but Terraform does, and this
project keeps real secrets out of state deliberately — the backend does the same
with SSM.

So:

1. Create the app in the Amplify console and connect
   `Ideonvn/consignment-warehouse-admin` there via the GitHub OAuth flow. This is
   the only step that handles a credential, and it leaves nothing behind in this
   repository.
2. Import it, then let Terraform own everything else:

   ```bash
   cd terraform/deployment
   terraform import 'module.admin_portal.aws_amplify_app.this' <app-id>
   terraform plan   # expect no repository/token diff
   ```

3. Leave `github_access_token = ""` in `terraform.tfvars`. It stays empty
   forever.

**Do not apply with `repository` set and no token as a way of skipping step 1.**
That combination is neither of the two documented shapes: it creates an app whose
repository is not actually connected, with no webhook and nothing to clone.

There is deliberately no `lifecycle { ignore_changes = [...] }` on the resource
to paper over this — see the comment in `shared/modules/amplify/main.tf` for why
that would hide the one kind of drift here worth seeing.

## DNS — Amplify owns the records

The hosted zone for `consignment-warehouse.com` is a Route 53 zone **in this same
AWS account**. That changes what a human has to do: **nothing.**

Amplify creates and manages both the certificate verification record and the
domain records, and renews the certificate. AWS's own documentation is the
evidence, in the shape of two procedures that differ exactly here:

- [Adding a custom domain managed by Amazon Route 53](https://docs.aws.amazon.com/amplify/latest/userguide/to-add-a-custom-domain-managed-by-amazon-route-53.html)
  ends at *"Choose **Add domain**"*. There is no DNS step in it at all, and root
  domains you already manage in Route 53 are offered in a type-ahead: *"As you
  start typing, any root domains that you already manage in Route 53 appear in
  the list."*
- [Adding a custom domain managed by a third-party DNS provider](https://docs.aws.amazon.com/amplify/latest/userguide/to-add-a-custom-domain-managed-by-a-third-party-dns-provider.html)
  is where the manual work lives: *"Amplify detects that you are not using a
  Route 53 domain"*, and then *"you must update your DNS records with your
  third-party domain provider … You will configure two CNAME records."*
- [Troubleshooting custom domains](https://docs.aws.amazon.com/amplify/latest/userguide/troubleshooting-custom-domains.html)
  splits the same way. For a third-party domain stuck in Pending Verification the
  remedy is *"confirm that the CNAME entry exists in your DNS settings with your
  domain provider"*. For a Route 53 domain stuck in the same state there is no
  such step — the entire remedy is a name-server mismatch between the hosted zone
  and the registered domain. Nobody is asked to check a record they created,
  because they did not create one.

Consequently:

- **No `aws_route53_record` resources here.** Amplify owns those records. A
  duplicate managed by Terraform would fight it for control of the zone, and ACM
  cannot renew the certificate if the verification record it owns is modified or
  deleted.
- The `domain_certificate_records` output is **informational** — for diagnosing a
  domain association stuck in `PENDING_VERIFICATION`, not a list to act on.

Two things do still need a human, and neither is a DNS record:

- The name servers on the registered domain must match the hosted zone's. If they
  do not, the association sits in `PENDING_VERIFICATION` — that is the Route 53
  troubleshooting path above.
- Until the domain is live, the app answers on the `amplifyapp.com` address from
  `terraform output default_domain`.

## CORS — the production counterpart of the port rule

`CLAUDE.md` records the local version: the dev server is pinned to port 3100
because on any other port every preflight is rejected with a bare `400` and no
CORS headers, which the browser reports as an opaque network failure —
indistinguishable from the API being down.

**The deployed origin has the same requirement at a new address.** The API's
`CORS_ALLOWED_ORIGINS` carries exactly:

```
https://consignment-warehouse.com
https://admin.consignment-warehouse.com
```

Matched **exactly**. It is a list, never a wildcard, and never a prefix match:

- `https://admin.consignment-warehouse.com/` — a trailing slash is a different
  string and does not match.
- `https://www.admin.consignment-warehouse.com` — `admin.` is not
  interchangeable with `www.admin.`.
- `http://…` — the scheme is part of the origin.

Any of those fails the same way port 3099 fails locally: a bare 400, no CORS
headers, and a browser reporting a network error. `terraform output
cors_origin_for_api` prints the exact string this deployment serves from. The
same origin belongs in `cors_allowed_origins` in the backend's Terraform, which
is what allows the browser to upload lot images straight to S3.

### Why the refresh cookie works across three hosts

The refresh token is an `HttpOnly`, `SameSite=Lax` cookie set by the API on
`api.consignment-warehouse.com`, and it is sent from pages served by
`admin.consignment-warehouse.com`. That works only because both share the
registrable domain `consignment-warehouse.com`, which makes the request
same-site even though it is cross-origin.

This is a constraint on any future host, not a happy accident. Moving the portal
to a different registrable domain — an `amplifyapp.com` address, a vanity
domain, a preview branch on someone else's domain — makes the cookie cross-site,
`SameSite=Lax` withholds it, and the session dies on the first reload while
everything else looks fine. The same trap in local form is in `.env.example`:
browsing `localhost` while the API base points at a LAN IP breaks for exactly
this reason.

## First sign-in — nobody can use the portal until this is done

The portal signs in with **phone OTP against the production API**. In production
`APP_ENV` is not `local`, so `OTP_DEV_CODE` does not apply: a real SMS is sent to
a real handset, and there is no `0000`.

There is deliberately **no bootstrap endpoint** — nothing in this app or the API
promotes the first operator. So a freshly deployed portal has no one who can
sign in and do anything, and that is not discoverable from this repository. The
sequence is:

1. Request an OTP for the operator's real number against the production API — by
   signing in at `https://admin.consignment-warehouse.com` and entering the
   number. This creates the user record, as a plain bidder.
2. Complete the sign-in with the SMS code, confirming the account exists.
3. **In the production database**, promote that user to `superadmin`. This is a
   backend-side step and is the only way the first one is made.
4. Sign out and back in. Role is read at sign-in, so the promotion takes effect
   on the next session, not the current one.

Every later admin can be promoted through the portal itself, by that superadmin —
role changes are superadmin-only by design.

Two things to know before doing it:

- **The OTP endpoint is rate limited per phone _and_ per source address.**
  Repeated attempts while testing will lock the number out for the window, and
  the failure looks like the code not arriving.
- **Never put a phone number in a URL** while diagnosing this. The API treats
  `phone_e164` as its most sensitive field, and the portal carries it in memory
  between the two sign-in steps rather than in a query parameter.
