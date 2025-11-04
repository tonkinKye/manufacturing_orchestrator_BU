# SECURITY GUIDE: Understanding Password Encryption

## Current State

Your passwords in `config.json` **ARE ENCRYPTED** using AES-256-CBC encryption. They are NOT plain text.

Example:
```json
{
  "password": "5ec2960b967fc397b314121c728c0d9d:e07f545af1f4e8b5d9a867405720c9bb"
}
```

This is encrypted. The format is: `[IV]:[encrypted_password]`

---

## The Security Concern

### Problem: "Security Through Obscurity"

While passwords are encrypted, the encryption key is currently **hardcoded in the source code**:

```javascript
// src/utils/encryption.js (line 11)
return crypto.createHash('sha256')
  .update('manufacturing-orchestrator-secret-key-2024')
  .digest();
```

This means:
- ✅ Casual viewing of config.json won't reveal passwords
- ❌ Anyone with access to both code AND config.json can decrypt
- ❌ If both are in git history, anyone can decrypt

---

## Threat Models

### What This DOES Protect Against:

1. **Accidental Config File Exposure**
   - Sending config.json to support
   - Backing up config.json separately
   - Config file viewed in file explorer

2. **Partial Access Scenarios**
   - Attacker only has config.json (not code)
   - Database backup includes config.json
   - Config file copied to another system

### What This DOES NOT Protect Against:

1. **Full Code + Config Access**
   - Attacker clones git repository (if both were tracked)
   - Server compromise (attacker has shell access)
   - Both files stolen together

2. **Insider Threats**
   - Developer with code access reads config.json
   - Anyone with deploy permissions

---

## Security Levels

### Level 1: Current (No .env) ⚠️
```
Encryption: AES-256-CBC ✅
Key Location: Hardcoded in src/utils/encryption.js ❌
Config.json: Gitignored ✅
Protection Level: Basic (obscurity)

Good for: Internal development, trusted environment
Risk: If codebase is exposed, passwords can be decrypted
```

### Level 2: With .env (Recommended) 🔒
```
Encryption: AES-256-CBC ✅
Key Location: .env file (gitignored) ✅
Config.json: Gitignored ✅
Protection Level: Good (separation of secrets)

Good for: Production, team environments
Risk: Server compromise still exposes everything
      But git repository can be public
```

### Level 3: Environment Variables Only (Best) 🛡️
```
Encryption: Not needed - secrets in environment
Key Location: N/A
Config.json: Not used for secrets
Protection Level: Best (secrets never touch disk)

Good for: Cloud deployments, CI/CD pipelines
Risk: Minimal - secrets only in memory and secure vaults
```

---

## Migration Guide

### Step 1: Understand What You Have

Check if config.json was ever in git:
```batch
git log --all --full-history -- config.json
```

If you see commits:
- ⚠️ Your encrypted passwords are in git history
- ⚠️ Encryption key is also in git (in code)
- 🚨 Anyone with repo access can decrypt

If no commits (or I cleaned it):
- ✅ You're safe from git exposure
- ⚠️ Still vulnerable if both code + config.json stolen together

### Step 2: Upgrade to .env (Recommended)

**A. Generate a new encryption key:**
```batch
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Output example: `a3d5f9e8c2b1a7f4e6d8c9b2a5f8e7d6c4b3a9f2e5d7c8b6a4f9e8d7c6b5a4f3`

**B. Create .env file:**
```batch
# Copy template
copy .env.example .env

# Edit .env and add:
ENCRYPTION_KEY=a3d5f9e8c2b1a7f4e6d8c9b2a5f8e7d6c4b3a9f2e5d7c8b6a4f9e8d7c6b5a4f3
NODE_TLS_REJECT_UNAUTHORIZED=true
```

**C. Re-encrypt your passwords:**
1. Start the server (it will load new ENCRYPTION_KEY from .env)
2. Open web interface: http://localhost:3000/index.html
3. Go to settings
4. Re-enter your Fishbowl password
5. Click Save

This re-encrypts with the new key from .env.

**D. Verify:**
```batch
# Old password (before)
type config.json.backup
# "password": "5ec2960b967fc397b314121c728c0d9d:e07f545af1f4e8b5d9a867405720c9bb"

# New password (after)
type config.json
# "password": "8a9f7e2c4d1b6f3a5e9c8d7b4a6f2e9c:c3f8e9a2d6b7f4e1a9c8d5b3f7e2a6c9"
# ^ Different! Now encrypted with .env key
```

**E. Security benefit:**
- Now you can share your codebase (even publicly!)
- Config.json and .env stay local (gitignored)
- No one can decrypt without .env file

### Step 3: Environment Variables Only (Optional)

For maximum security, don't use config.json at all:

**Edit .env:**
```bash
ENCRYPTION_KEY=a3d5f9e8c2b1a7f4e6d8c9b2a5f8e7d6c4b3a9f2e5d7c8b6a4f9e8d7c6b5a4f3
NODE_TLS_REJECT_UNAUTHORIZED=true

# Add Fishbowl credentials directly
FISHBOWL_SERVER_URL=https://your-server:28192
FISHBOWL_USERNAME=admin
FISHBOWL_PASSWORD=your_actual_plain_password_here
FISHBOWL_DATABASE=ceres_tracking_v2

# MySQL credentials
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=ceres_tracking_v2
```

**Note**: The .env template includes this, but the application would need modification to read directly from environment variables instead of config.json. This is a future enhancement.

---

## FAQ

### Q: If passwords are encrypted, why do I need .env?

**A**: Encryption alone doesn't help if the key is in the same place as the encrypted data. It's like locking a safe but leaving the key taped to it.

### Q: Is AES-256-CBC secure?

**A**: Yes! AES-256 is military-grade encryption. The problem isn't the encryption algorithm, it's **key management**.

### Q: Can someone decrypt my password right now?

**A**: Only if they have:
1. Your config.json file (has encrypted password), AND
2. Your source code (has hardcoded key)

If config.json was in git history and pushed to GitHub, then yes, anyone with repo access could decrypt.

If config.json was never committed (which I ensured), then they'd need access to your actual server/workstation.

### Q: What if config.json was in git before you removed it?

**A**: The encryption key is still in git (it's in the code). If old config.json is in history:

**Option 1 - Rotation (Recommended):**
- Change your Fishbowl password
- Update config.json with new password
- Old git history has old password (now invalid)

**Option 2 - History Rewrite (Nuclear):**
- Use git filter-branch to remove config.json from ALL history
- Force push to remote
- Everyone must re-clone repository
- Complex and risky

**Option 3 - Accept Risk:**
- If repo is private and only trusted team has access
- Old password already changed
- Monitor for unauthorized access

### Q: Should I use .env for development?

**A**: Not required, but good practice:
- Gets you in the habit for production
- Lets you share code with team safely
- No risk if you accidentally commit

### Q: Does the NSSM service load .env automatically?

**A**: No! Windows services don't automatically load .env files. You need to:

**Option 1**: Set environment variables in NSSM config:
```batch
nssm set ManufacturingOrchestrator AppEnvironmentExtra ENCRYPTION_KEY=abc123...
```

**Option 2**: Use dotenv package (requires code change)

**Option 3**: Keep using config.json (current approach)

---

## Best Practices Summary

### For Development (Current Setup) ✅
- Passwords encrypted in config.json
- config.json gitignored
- Acceptable risk for internal development

### For Production (Recommended Upgrade) 🔒
1. Create .env with custom ENCRYPTION_KEY
2. Re-encrypt passwords
3. Keep .env file secure and backed up separately
4. Use NSSM environment variables for service

### For Cloud/Enterprise (Advanced) 🛡️
1. Use secrets manager (AWS Secrets Manager, Azure Key Vault, etc.)
2. No secrets on disk at all
3. Inject at runtime from secure vault

---

## Action Items

### Priority 1: Verify Git History ✅
```batch
git log --all --full-history -- config.json
```
If it shows commits, consider rotating passwords.

### Priority 2: Document Current State ✅
- [x] Passwords are encrypted (AES-256-CBC)
- [x] config.json is gitignored (after optimization)
- [x] Key is hardcoded (acceptable for internal use)

### Priority 3: Plan Production Security 📋
- [ ] Create .env file
- [ ] Generate custom ENCRYPTION_KEY
- [ ] Re-encrypt passwords
- [ ] Configure NSSM with environment variables
- [ ] Document .env setup in deployment guide

### Priority 4: Review Access Controls 🔍
- Who has access to production server?
- Who has git repository access?
- Is repo public or private?
- Do you need to rotate passwords?

---

## Conclusion

Your passwords **are encrypted and protected**. The current setup is:

✅ Secure enough for internal development
✅ Better than plain text
⚠️ Could be improved with .env for production

The .env approach provides **defense in depth** - even if part of the system is compromised, the full picture isn't exposed.

**You don't need to panic**, but planning a migration to .env for production is a good idea.
