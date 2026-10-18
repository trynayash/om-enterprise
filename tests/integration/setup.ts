import "dotenv/config";

// Point the application's DB singleton at the test database before any module uses it.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_SECRET ??= "test-secret-test-secret-test-secret";
