# Transport Portal – Business Functionality (Current State)

**Document purpose**  
This document summarises all business functionality delivered to date in the Transport Portal repository, for review by the Business Analyst, Engagement Manager, Project team, and Product Owner.

**As of:** 26 February 2026

---

## 1) Solution Overview

The solution currently documents the **Passenger Transport Portal (React SPA)**:
- Role-based passenger transport request lifecycle
- Dataverse-backed data model and saved-view queues
- Entra ID sign-in with Dataverse role mapping

The primary business process in scope is the end-to-end passenger request and authorisation flow.

---

## 2) User Personas and Access

### Core personas implemented
- Passenger
- HR Personnel
- Authoriser
- Booking Officer
- System Administrator

### Access model
- Access is determined at runtime by Dataverse Security Role IDs configured in environment variables.
- UI navigation and route guards are role-aware.
- System Administrator is treated as full-access across role-gated areas.

### External user onboarding and access (new)
- External users (outside the home Entra tenant) can sign in to the same application.
- If an external user is not present as a Dataverse `systemuser` role-mapped record, the app checks for an existing Dataverse **Contact** using the signed-in email address.
- If no Contact exists, the user is redirected to a one-time onboarding page to complete basic details.
- On submit, a Contact record is created (first name, last name, email).
- Once Contact exists, the app grants **Passenger-equivalent** access (same passenger user experience).
- For external passenger journeys (lookup loading, request submission, and my-requests retrieval), the app uses the dedicated external onboarding API integration path.
- Internal tenant users continue to use existing Dataverse security-role mapping behavior without change.

### Current top-level navigation behavior
- **Home**: all users
- **Raise request**: passenger-only profile
- **Raise request as HR**: HR + System Admin
- **My requests**: available to signed-in users with view permissions
- **Authoriser dropdown**: Authorisations queue
- **Booking Officers dropdown**:
  - Approvals
  - Authorised Approvers

---

## 3) Passenger / HR Request Creation Functionality

## 3.1 Request initiation
- Users start from Home and are directed to a role-appropriate options page.
- Request options page presents actions based on role profile (Passenger, HR, Authoriser).

## 3.2 Single and group request creation
- Supports:
  - **Single passenger request**
  - **Group request (2–10 passengers)**
- Group flow creates a Dataverse Group record and links member passenger bookings.

## 3.3 Flight-level shared inputs
- From airport
- To airport
- Authoriser
- Departure datetime
- Optional return datetime

## 3.4 Passenger-level details captured
- Identity details (name, service number, military/civilian, gender, DOB)
- Nationality and travel purpose
- Contact and emergency details
- Documentation (document type/number, passport details)
- Visa details
- Medical/allergy and meal/disability related inputs

## 3.5 Validation and submission behavior
- Required-field and format validation (including dates and key lookups)
- Status on submission: **Submitted**
- Confirmation panel shown after successful submission
- Returned references shown when provided by Dataverse

## 3.6 Delivered but currently minimal page
- **HR Bulk Add** page exists as placeholder (not yet feature-complete bulk upload workflow).

---

## 4) Request Visibility / Listing

## 4.1 My Requests
- Lists a signed-in user’s requests.
- Uses configured Dataverse view when available; fallback to direct query.
- Displays request basics and lifecycle metadata (status, dates, created date).
- External passenger my-requests retrieval is delivered through the backend external onboarding API using signed-in email context.

## 4.2 All Requests
- Admin-oriented listing of all passenger requests across the organisation.
- Table view with key travel and status fields.

---

## 5) Authoriser Functionality

## 5.1 Queue scope and segmentation
- Authoriser page presents:
  - **Pending Authoriser Approval** (Passengers + Groups)
  - **Rejected by Booking Office** (Passengers + Groups)
- Queue is filtered to the current authoriser identity where authoriser matching is available.

## 5.2 Request review experience
- Modal review with tabbed sections:
  - Identity
  - Travel
  - Documents
  - Medical
  - Contacts
  - Group (for grouped requests)

## 5.3 Authorisation data capture
- Authoriser details and mandatory fields captured (e.g., name, contact, date, UIN).
- Lookup-driven capture for rank/service/travel/purpose-of-travel codes.
- Supports additional notes fields (reason, special requests, JFET/JPAN, etc.).

## 5.4 Authoriser decisions implemented
- **Authorise**
  - Saves/updates Authorisation record
  - Sets Authorisation status to **Approved by Authoriser**
  - Associates booking office from active authoriser profile
- **Reject back to Passenger/Group**
  - Sets Authorisation status to **In Progress**
  - Reassigns booking ownership back to originating user where available
- **Cancel**
  - Sets Authorisation status to **Cancelled**
  - Applies inactive state update on Authorisation record

## 5.5 Group linkage behavior (implemented)
- On group decision paths, Group records are now updated with the **Authorisation Reference lookup**.
- This linkage supports group visibility in downstream Booking Officer group queues.

## 5.6 Passenger linkage behavior (implemented)
- On authorise decisions, the Passenger Booking record is updated with the **Authroisation Reference lookup**.
- This linkage supports passenger visibility in downstream Booking Officer "Approved by Authoriser" queues that rely on authorisation joins.

---

## 6) Booking Officer Functionality

## 6.1 Approvals page and queue tabs
The Booking Officer Approvals area is tab-driven and uses Dataverse saved views:
- Pending Authoriser Approval
- Approved by Authoriser
- Rejected by Booking Officer
- Ready for AirCore

Each tab supports both:
- Passenger rows
- Group rows

## 6.2 Review and actions
- Review modal with passenger detail tabs and comments panel.
- Add comments to the passenger booking timeline.
- Available workflow actions:
  - **Reject** (with mandatory reason) → sets Authorisation status to Rejected by Booking Officer
  - **Ready for AirCore** → updates Authorisation status accordingly

## 6.3 Authorised Approvers administration
- Separate page under Booking Officers menu.
- Uses active authorisers view.
- Allows create, edit, and delete operations for authoriser records.
- Supports deletion confirmation before remove action.
- On delete, the corresponding user is removed from their assigned Booking Office team.
- Allows inline edit and save for:
  - Authoriser name
  - Email
  - Booking office team
- Booking office picklists in this admin area are intentionally constrained to:
  - Booking Office A
  - Booking Office B
  - Booking Office C

---

## 7) Status & Workflow Model in Use

## 7.1 Passenger transport request status (request table)
Used at submission and general request lifecycle levels:
- Submitted
- In Progress
- Approved
- Rejected
- Cancelled

## 7.2 Authorisation status (authorisation table)
Primary decision lifecycle for Authoriser/Booking Officer workflow:
- Pending Authoriser Approval
- Approved by Authoriser
- Rejected by Booking Office
- Ready for AirCore
- In Progress
- Cancelled

**Current business implementation emphasis:** Authorisation-centric status progression for approval workflow decisions.

---

## 8) Data Integration and Configuration Capabilities

## 8.1 Dataverse integration
Implemented capabilities include:
- Create passenger request
- Create group record
- List requests (all, mine, and by saved view)
- List, create, update, and delete authorisers
- List teams for booking office assignment
- Save and update authorisation records
- Update authorisation status for bookings
- Add/list booking comments
- Reassign booking owner
- Update group authorisation reference linkage
- Update passenger authorisation reference linkage
- Resolve external Contact by email
- Create external Contact during onboarding
- Remove user from Booking Office team on authorised-approver deletion

## 8.4 External onboarding API support (business-facing)
Implemented API-backed external journey capabilities include:
- External Contact lookup/create for onboarding
- External passenger lookup dataset retrieval for request form controls
- External passenger request submission
- External my-requests retrieval by signed-in external identity email

## 8.2 Config-driven behavior
Major business queues are driven by environment-configured Dataverse view GUIDs, allowing business reconfiguration without code changes where views already exist.

## 8.3 Authentication and role resolution
- Entra ID + MSAL for sign-in/token acquisition
- Dataverse role resolution maps runtime user role IDs to app permissions
- External-user detection by tenant boundary with Contact-based onboarding fallback for Passenger-equivalent access

---

## 9) Delivered Operational/Supporting Capability

## 9.1 Dataverse solution lifecycle support
Repository includes artifacts and workflow to export/unpack Dataverse solution content for source control and deployment management.

---

## 10) Known Current Boundaries / In-Progress Areas

- **HR Bulk Add page** exists but is currently placeholder-level.
- A legacy `BookingOfficerQueuePage` component exists in codebase but is not the primary routed flow; active Booking Officer experience is the `/admin` Approvals path.
- Some UX and state-code values remain configuration-dependent on target Dataverse environment conventions.
- External onboarding currently creates/uses Dataverse Contact records and grants Passenger-equivalent access in-app; if additional downstream security model alignment is required (for example, external records in custom tables or automated role assignment), that is a separate enhancement.
- External journey support depends on external onboarding API environment configuration and service availability.

---

## 11) Summary for Stakeholders

The delivered product supports the full core business chain from request creation through authorisation and booking-office progression, with role-based access control, Dataverse integration, queue-driven operations, and group-aware processing. Recent enhancements include strengthened external-user passenger flows through the onboarding API path, robust authorisation linkage updates for both group and passenger queue visibility, and expanded Authorised Approvers administration (including add/delete, confirmation, and booking-office team cleanup).
