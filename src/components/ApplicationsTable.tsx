import Link from "next/link";
import type { Application } from "@/lib/applications";
import { formatDate, formatInr, formatProduct } from "@/lib/format";
import { Icon } from "./Icon";
import { StatusBadge } from "./StatusBadge";

// Table on wide screens, one card per row below 720px (the cells carry data-label for the card layout).
export function ApplicationsTable({ items }: { items: Application[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">Applications (simulated demo data)</caption>
        <thead>
          <tr>
            <th scope="col">Reference</th>
            <th scope="col">Applicant</th>
            <th scope="col">Loan product</th>
            <th scope="col" className="th-amount">Requested amount</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
            <th scope="col"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td data-label="Reference" className="cell-ref">
                <Link href={`/admin/applications/${a.id}`}>{a.reference}</Link>
              </td>
              <td data-label="Applicant">
                <div className="cell-person">
                  <div className="cell-name">{a.applicantName}</div>
                  <div className="cell-sub">{a.email}</div>
                </div>
              </td>
              <td data-label="Loan product">{formatProduct(a.loanProduct)}</td>
              <td data-label="Amount" className="cell-amount">{formatInr(a.requestedAmount)}</td>
              <td data-label="Status"><StatusBadge status={a.status} /></td>
              <td data-label="Created" className="cell-date">{formatDate(a.createdAt)}</td>
              <td data-label="Action">
                <Link href={`/admin/applications/${a.id}`} className="btn btn-secondary btn-sm" aria-label={`Open ${a.reference}`}>
                  Open <Icon name="arrowRight" size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
