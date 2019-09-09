gcloud kms decrypt \
  --ciphertext-file=./config/production.js.enc \
  --plaintext-file=./config/production.js \
  --location=global \
  --keyring=CytoidIO \
  --key=SecretKey \
