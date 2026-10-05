# Token of the API process: signs the catalogues of the terminals with its own key, nothing else (SEC-04).
path "transit/sign/etare-catalog" {
  capabilities = ["update"]
}

# Public keys and versions of its key (the API signs with the version active in the key set).
path "transit/keys/etare-catalog" {
  capabilities = ["read"]
}
