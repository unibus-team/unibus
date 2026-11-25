# UniBus Security Specification (Phase 0)

## 1. Data Invariants
1. **PII Isolation (`users`)**: Only the owning user (`request.auth.uid == userId`) or a verified admin may read a user document; students cannot list all users or escalate their own `role` to `'admin'`.
2. **Booking Ownership (`bookings`)**: A student can only read, list, create, cancel, or restore bookings where `userId == request.auth.uid`.
3. **Catalog Integrity (`buses`, `routes`)**: Only verified admins (`mohamedalkawaity@gmail.com` or `admins/{uid}`) can create, edit, or delete fleet vehicles and routes.
4. **Seat Inventory Updates (`trips`)**: Admins manage full trip definitions; signed-in students may only update `freeSeats` and `bookedSeats` when booking/cancelling a trip.
5. **Path & Field Bounds**: All document IDs must match `^[a-zA-Z0-9_\-]+$` (<= 128 chars), and all string fields enforce strict `.size()` limits.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Privilege Escalation on Signup**: `POST /users/uid123` with `{ role: "admin" }` by a regular student.
2. **Shadow Field Injection on User Update**: `PATCH /users/uid123` adding `{ isVerified: true }`.
3. **Cross-User PII Read**: Student A calling `GET /users/studentB`.
4. **Blanket User Scraping**: Student calling `LIST /users`.
5. **Cross-User Booking Creation**: Student A creating `/bookings/bk99` with `userId: "studentB"`.
6. **Booking Price Tampering**: Student updating `totalEgp` on an existing booking.
7. **Unauthorized Route Deletion**: Student calling `DELETE /routes/r-kez-tanta`.
8. **Unauthorized Bus Creation**: Student calling `POST /buses/b-fake`.
9. **Trip Price Tampering by Student**: Student updating `priceEgp` on `/trips/17`.
10. **ID Poisoning**: Creating `/bookings/` with a 500-character ID or invalid characters (`../admin`).
11. **Unverified Admin Email Spoof**: Unauthenticated or unverified request attempting admin write.
12. **Oversized Comment Payload**: Student submitting a `/reviews/r1` document with a 5,000-character `comment`.
