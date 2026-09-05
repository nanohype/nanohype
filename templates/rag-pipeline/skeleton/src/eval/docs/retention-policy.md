# Log retention policy

Audit logs stay in hot storage for 180 days. At 180 days they move to cold
storage, where they are held until they are purged at 400 days.

Restoring a range of logs from cold storage takes up to 48 hours and needs an
approved access request naming the range and the reason for it.

Application debug logs are not audit logs and are discarded after 14 days.
