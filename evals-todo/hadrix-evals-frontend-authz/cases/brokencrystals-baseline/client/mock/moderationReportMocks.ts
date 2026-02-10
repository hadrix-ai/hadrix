import { ReportStatuses } from "../constants/moderationReportStatuses";

export const moderationReportMocks = [
  {
    id: "rep_1024",
    submittedBy: "riley@brokencrystals.test",
    summary: "Spammy DMs with links to fake merch drops.",
    status: ReportStatuses.open,
  },
  {
    id: "rep_1041",
    submittedBy: "mono@brokencrystals.test",
    summary: "Harassment in #marketplace thread, screenshots attached.",
    status: ReportStatuses.triaged,
  },
  {
    id: "rep_1077",
    submittedBy: "luca@brokencrystals.test",
    summary: "Impersonation report for a staff account.",
    status: ReportStatuses.open,
  },
];
