# Token of the worker: signs the manifests of publications and base maps, nothing else (SEC-04).
path "transit/sign/etare-publication" {
  capabilities = ["update"]
}

# Public keys and versions of its key (the worker signs with the version active in the key set).
path "transit/keys/etare-publication" {
  capabilities = ["read"]
}
