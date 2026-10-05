# Key holders, during a ceremony only: read the public keys and create a new version (rotation).
# No sign, no export, no deletion: a new version signs only once announced by a key set signed with the
# offline root key (docs/exploitation/cles-de-signature.md).
path "transit/keys/etare-publication" {
  capabilities = ["read"]
}

path "transit/keys/etare-catalog" {
  capabilities = ["read"]
}

path "transit/keys/etare-publication/rotate" {
  capabilities = ["update"]
}

path "transit/keys/etare-catalog/rotate" {
  capabilities = ["update"]
}
