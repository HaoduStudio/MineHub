import { generateSigningKey } from "../server/signing"
await generateSigningKey()
console.log("Signing key created. Back it up together with the database.")
