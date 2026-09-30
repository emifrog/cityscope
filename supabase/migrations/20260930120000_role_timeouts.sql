-- Server-side timeouts of the application roles.
--
-- Declared on the roles rather than sent by the client as startup parameters:
-- connection poolers (Supavisor, PgBouncer) may reject or ignore startup
-- parameters, while role settings apply whatever the connection path. They
-- protect the database from runaway queries and from transactions left open.
alter role etare_api set statement_timeout = '5s';
alter role etare_api set idle_in_transaction_session_timeout = '15s';
alter role etare_api set lock_timeout = '3s';

alter role etare_worker set statement_timeout = '60s';
alter role etare_worker set idle_in_transaction_session_timeout = '60s';
alter role etare_worker set lock_timeout = '10s';
