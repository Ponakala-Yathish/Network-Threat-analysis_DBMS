// Imported FIRST by every db:* script (before ../lib/db creates the pool).
// Makes the scripts log in as the database owner (DATABASE_USER, normally
// postgres) instead of the restricted threat_app account the web app uses:
// migrations create tables and roles, which the app account cannot do.
process.env.DB_CONNECT_AS = 'owner';
export {};
