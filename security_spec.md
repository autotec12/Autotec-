# Security Specification: sparkRastreioFin Firestore Security

## 1. Data Invariants
1. Only authenticated operators/admins can read and write business records.
2. A Vehicle cannot exist without a valid associated `clientId`.
3. A Charge cannot exist without valid `clientId` and `vehicleId`.
4. The `originalMonthlyValue` of a contract/charge is immutable and can never be altered retroactively.
5. A Payment cannot be deleted once created (write-once immutable financial ledger).
6. A partial payment cannot mark a charge as `pago` if `remainingBalance > 0`.
7. Client documents, vehicles, and charges have bounded string sizes and strict schema keys.
8. Bootstrapped admin is `primecell435@gmail.com` with elevated system administration rights.

## 2. The Dirty Dozen Payloads (Rejected by Security Model)
1. **Unauthenticated Read:** Request from anonymous/unauthenticated user to `/charges`. -> REJECT (Not signed in).
2. **Ghost Field Injection:** Inserting `{ "name": "Cliente X", "backdoor": true }` to `/clients`. -> REJECT (Excess key).
3. **Delete Confirmed Payment:** An operator attempts to `delete()` a document in `/payments/{id}`. -> REJECT (Deletes forbidden on payments).
4. **Tamper Original Monthly Value:** Attempting an update to `originalMonthlyValue` in `/charges/{id}`. -> REJECT (Field is immutable).
5. **False Paid Status:** Setting `status = 'pago'` when `remainingBalance = 40.00`. -> REJECT (Inconsistent state).
6. **Negative Monthly Fee:** Creating a vehicle with `monthlyValue = -50`. -> REJECT (Value must be > 0).
7. **Junk ID Poisoning:** Document ID consisting of 500 characters or special injection characters. -> REJECT (isValidId check fails).
8. **Orphan Vehicle Creation:** Creating a vehicle with an empty or non-existent `clientId`. -> REJECT (Missing relation).
9. **Fake Admin Escalation:** User modifying their own role in `/users/{userId}` to `admin`. -> REJECT (Self role escalation forbidden).
10. **Huge String Denial of Wallet:** Submitting a client notes field with 1MB text. -> REJECT (Max length exceeded).
11. **Negative Payment Amount:** Creating a payment with `amount = -100`. -> REJECT (Must be positive).
12. **Unverified Email Access:** Accessing administrative collections with an unverified email token when verification is required. -> REJECT.
