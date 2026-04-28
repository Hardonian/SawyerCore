# Governance Policy

## IMPLEMENTED
- Fail-closed behavior on missing/invalid policy context.
- Private/sensitive classification denied for cloud-like routes.
- Cost cap and token cap enforcement before provider execution.
- Unsafe private-mode + cloud-fallback conflict detection at config load/doctor time.

## CONFIG-DEPENDENT
- Tenant permissions (`tenantPermissions`).
- Cloud egress allowlist (`cloudEgressAllowedFor`).
- Fallback policy and request-size ceilings.

## STUBBED
- External policy distribution/signing.

## FUTURE
- Policy simulation API for dry-run audits before rollout.
