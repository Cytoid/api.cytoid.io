gcloud kms encrypt \
  --plaintext-file=./config/production.js \
  --ciphertext-file=./config/production.js.enc \
  --location=global \
  --keyring=CytoidIO \
  --key=SecretKey
