import "dotenv/config";

import { validateProductionEnvironment } from "../src/lib/environment-schema";

const errors = validateProductionEnvironment(process.env);
if (errors.length) {
  console.error(`Deployment configuration is invalid: ${errors.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Deployment configuration is valid.");
}
