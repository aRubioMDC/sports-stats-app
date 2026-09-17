import truststore

# Use the OS trust store (covers corporate proxy root CAs) for all outbound HTTPS calls.
truststore.inject_into_ssl()
