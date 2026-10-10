REVOKE ALL ON TABLE insurance_ledger_accounts FROM "{{role}}";
REVOKE ALL ON TABLE insurance_ledger_journals FROM "{{role}}";
REVOKE ALL ON TABLE insurance_ledger_lines FROM "{{role}}";
REVOKE ALL ON TABLE insurance_ledger_audit FROM "{{role}}";
REVOKE ALL ON SEQUENCE insurance_ledger_lines_id_seq FROM "{{role}}";
REVOKE ALL ON SEQUENCE insurance_ledger_audit_id_seq FROM "{{role}}";

GRANT SELECT, INSERT ON TABLE insurance_ledger_accounts TO "{{role}}";
GRANT SELECT, INSERT, UPDATE ON TABLE insurance_ledger_journals TO "{{role}}";
GRANT SELECT, INSERT ON TABLE insurance_ledger_lines TO "{{role}}";
GRANT SELECT, INSERT ON TABLE insurance_ledger_audit TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE insurance_ledger_lines_id_seq TO "{{role}}";
GRANT USAGE, SELECT ON SEQUENCE insurance_ledger_audit_id_seq TO "{{role}}";
