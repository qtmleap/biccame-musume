#!/bin/sh
# Import the commit-signing GPG key from the read-only host keyring mount.
# Copies the already-encrypted secret key file (no passphrase needed here);
# the passphrase is entered once on the first commit and cached by gpg-agent.
set -e

HOST_GNUPG="${HOME}/.gnupg-host"
SIGNING_KEY="C9DE991D1A522478"

# Skip silently when the host keyring is not mounted (e.g. CI).
[ -d "${HOST_GNUPG}" ] || exit 0

mkdir -p "${HOME}/.gnupg"
chmod 700 "${HOME}/.gnupg"

# Allow non-interactive (loopback) passphrase entry in this tty-less setup.
grep -q "allow-loopback-pinentry" "${HOME}/.gnupg/gpg-agent.conf" 2>/dev/null \
  || echo "allow-loopback-pinentry" >> "${HOME}/.gnupg/gpg-agent.conf"
grep -q "pinentry-mode loopback" "${HOME}/.gnupg/gpg.conf" 2>/dev/null \
  || echo "pinentry-mode loopback" >> "${HOME}/.gnupg/gpg.conf"
chmod 600 "${HOME}/.gnupg/gpg.conf" "${HOME}/.gnupg/gpg-agent.conf"

# Import the public key (idempotent).
gpg --homedir "${HOST_GNUPG}" --export "${SIGNING_KEY}" | gpg --import

# Copy only this key's encrypted secret key files (primary + encryption subkey).
mkdir -p "${HOME}/.gnupg/private-keys-v1.d"
chmod 700 "${HOME}/.gnupg/private-keys-v1.d"
for KEYGRIP in \
  8DA42BA9FF99B23F5C1558478D359D8FD5122C8E \
  B339B82DDDAC7051711454E23596D5486141480C
do
  SRC="${HOST_GNUPG}/private-keys-v1.d/${KEYGRIP}.key"
  [ -f "${SRC}" ] && cp "${SRC}" "${HOME}/.gnupg/private-keys-v1.d/${KEYGRIP}.key"
done
chmod 600 "${HOME}/.gnupg/private-keys-v1.d/"*.key 2>/dev/null || true

gpgconf --kill gpg-agent 2>/dev/null || true

# Configure git to sign commits with this key (repo-local: ~/.gitconfig is a
# read-only host mount and cannot be written).
git config --local user.signingkey "${SIGNING_KEY}"
git config --local commit.gpgsign true
git config --local gpg.program gpg

echo "GPG signing configured with key ${SIGNING_KEY}."
echo "The passphrase will be requested once on your first commit, then cached."
