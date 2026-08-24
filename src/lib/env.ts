import "server-only";

import { readServerEnvironment } from "@/lib/environment-schema";

export function getServerEnvironment() {
  return readServerEnvironment(process.env);
}
