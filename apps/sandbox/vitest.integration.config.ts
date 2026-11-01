// Integration tests for the sandbox: the store, CRM, messaging, and outage routes against a real
// PostgreSQL 17 container (Testcontainers; needs Docker).
import { integrationConfig } from "@clever/config/vitest/integration";

export default integrationConfig();
