/** Aggregates every resource definition (split by domain). */
import type { ResourceDefinition } from "./shared";
import { ACADEMICS_RESOURCES } from "./academics";
import { PEOPLE_RESOURCES } from "./people";
import { ASSESSMENT_RESOURCES } from "./assessment";
import { FINANCE_RESOURCES } from "./finance";
import { HR_RESOURCES } from "./hr";
import { LIBRARY_RESOURCES } from "./library";
import { TRANSPORT_RESOURCES } from "./transport";
import { HOSTEL_RESOURCES } from "./hostel";
import { COMMUNICATION_RESOURCES } from "./communication";
import { OPERATIONS_RESOURCES } from "./operations";

export type { ResourceDefinition } from "./shared";

export const RESOURCES: ResourceDefinition[] = [
  ...ACADEMICS_RESOURCES,
  ...PEOPLE_RESOURCES,
  ...ASSESSMENT_RESOURCES,
  ...FINANCE_RESOURCES,
  ...HR_RESOURCES,
  ...LIBRARY_RESOURCES,
  ...TRANSPORT_RESOURCES,
  ...HOSTEL_RESOURCES,
  ...COMMUNICATION_RESOURCES,
  ...OPERATIONS_RESOURCES,
];
