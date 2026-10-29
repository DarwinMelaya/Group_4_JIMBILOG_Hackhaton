# Project Brief: Privacy-Matched STI Testing Navigation and Appointment System

## 1. Project Overview

The Privacy-Matched STI Testing Navigation and Appointment System is a proposed digital health platform designed to help young people aged 15–24, particularly high school and college students, access reliable sexually transmitted infection (STI) information and seek professional testing with greater confidence and privacy.

The initial implementation will focus on Marinduque, Philippines, by connecting users with existing healthcare facilities and their available services. The system will provide anonymous access to educational resources, privacy-focused clinic matching, confidential appointment requests, and guidance throughout the testing process.

Its defining feature is the **Privacy-Matched Testing Pathway**, which helps users identify their concerns about seeking testing and find an appropriate healthcare provider based on verified service information and privacy practices.

The system will complement existing healthcare services rather than replace medical professionals, laboratories, or established clinical procedures.

## 2. Background and Rationale

The Philippines recorded 4,633 newly reported HIV cases in the first quarter of 2026. Individuals aged 15–24 accounted for 31% of these cases, highlighting the importance of addressing HIV prevention and testing among young people [1].

Research involving young Filipinos has also identified gaps in STI knowledge, including limited awareness of infections such as chlamydia and hepatitis B. Many sexually active participants in one localized study reported not getting tested annually [2].

A qualitative systematic review covering young people across Asia-Pacific countries identified embarrassment, confidentiality concerns, limited decision-making autonomy, and social expectations as barriers to accessing sexual and reproductive health services [4]. A separate Philippine study on HIV self-testing also highlighted confidentiality and convenience as important considerations [5].

These findings suggest that access to health information alone might not be enough. Young people also need practical assistance in finding appropriate services and understanding how to access them without unnecessary fear or uncertainty.

The proposed system addresses this gap by connecting reliable information to a concrete action: requesting and attending a professional testing appointment.

The cited research supports the relevance of these barriers, but it does not establish that the proposed system will automatically increase testing rates. Its effectiveness must be evaluated through an actual pilot implementation.

## 3. Problem Statement

Young people aged 15–24 may hesitate to seek STI testing because of misinformation, embarrassment, fear of judgment, concerns about being recognized, uncertainty about clinic procedures, and difficulty finding appropriate healthcare services.

Existing digital resources provide STI information and clinic directories, while some platforms also support testing appointments. However, the proposed project seeks to address the specific needs of young people in Marinduque through a localized pathway that connects their privacy concerns with verified clinic information and available appointment procedures.

The project will investigate and address the following problems:

1. **Information gaps:** Young people need accurate, understandable STI information and guidance on when to seek professional care.
2. **Privacy and stigma concerns:** Users need clear explanations of confidentiality procedures and the information a clinic requires.
3. **Difficulty accessing services:** Users need a convenient way to identify suitable testing facilities and understand their booking requirements.
4. **Disconnection between awareness and action:** Users who decide to seek testing need a practical way to proceed to an appointment.

## 4. Project Goal and Objectives

### General Goal

To encourage and facilitate professional STI testing among young people aged 15–24 by reducing information, privacy, stigma-related, and service-navigation barriers.

### Specific Objectives

1. Provide accurate and medically reviewed STI information through an accessible digital platform.
2. Help users identify their privacy concerns and find appropriate healthcare facilities based on verified information.
3. Enable confidential appointment requests through participating clinics, using low-disclosure booking options where supported.
4. Guide users through appointment preparation, consultation, testing, and access to results.
5. Provide directions to treatment and follow-up services when recommended by healthcare professionals.
6. Measure user engagement, appointment requests, confirmed appointments, and testing attendance where participating clinics can report these outcomes appropriately.

## 5. Proposed Solution

The project will be implemented as a mobile-first Progressive Web App (PWA). Users will access it through a browser without needing to install a conventional mobile application.

The platform will connect two main groups: young people seeking information and testing, and authorized healthcare personnel responsible for maintaining clinic information and managing appointment requests.

Its primary innovation is the Privacy-Matched Testing Pathway. Rather than simply presenting a list of clinics, the system will help users identify the barriers they face and find providers whose verified services and privacy practices address their needs.

For example, a user worried about being recognized will be able to review a clinic's stated confidentiality procedures and booking requirements before requesting an appointment. A user concerned about cost will be able to compare published fees where available.

The system will not guarantee anonymity when a clinic requires identifying information. Instead, it will explain the relevant requirements before users submit their requests.

## 6. Target Users and Stakeholders

### Primary Users

| **User group**                               | **Role in the system**                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| High school students aged 15–18              | Access age-appropriate STI information, understand testing options, and locate suitable healthcare services. |
| College students aged 18–24                  | Explore STI information, identify privacy preferences, search clinics, and request appointments.             |
| Other young adults and members of the public | Access STI education and locate appropriate testing services.                                                |

Basic information and clinic searches will not require an account. Access to clinical services will remain subject to the provider's requirements and applicable consent rules.

### Administrators and Supporting Stakeholders

| **Stakeholder**                                                                  | **Proposed responsibility**                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Provincial Health Office (PHO), Marinduque                                       | Proposed lead administrator responsible for local coordination, clinic directory oversight, and aggregate reports. |
| DOH MIMAROPA Center for Health Development and other relevant health authorities | Provide technical guidance and support alignment with public health programs.                                      |
| Participating hospitals, clinics, and municipal health offices                   | Maintain facility information, confirm appointments, explain testing procedures, and provide clinical care.        |
| School and university health personnel                                           | Promote access to approved educational resources and direct students to appropriate healthcare services.           |
| Technical administrators                                                         | Maintain system security, account permissions, backups, and technical operations.                                  |

These are proposed roles, not confirmed institutional commitments. The participating institutions and their actual responsibilities must be agreed upon before implementation.

## 7. Core System Features

### 7.1. Anonymous Access and STI Information Hub

Users will access medically reviewed STI information without creating an account.

The information hub will cover common STIs, symptoms, transmission, prevention, testing options, and guidance on when professional assessment is appropriate. It will also address common misconceptions and explain what users should expect during testing.

**Purpose:** Reduce misinformation and uncertainty before users decide whether to seek care.

### 7.2. Privacy-Matched Testing Pathway

This will be the system's defining feature.

Users will select the concerns that affect their willingness to seek testing, such as fear of recognition, judgment, unwanted disclosure, cost, travel, or uncertainty about clinic procedures.

The system will use these preferences to filter participating clinics based on verified information. It will display relevant service details and clearly identify which privacy practices the facility has confirmed.

**Purpose:** Help users make informed decisions based on their personal concerns rather than relying on generic clinic listings.

### 7.3. Verified Clinic Directory

The directory will contain information about participating healthcare facilities, including:

- Location and contact information.
- Available STI and HIV services.
- Operating schedules and appointment procedures.
- Published fees, where available.
- Booking requirements and supported confirmation methods.
- Documented confidentiality and youth-friendly practices.
- Referral options when a needed service is unavailable locally.

Authorized clinic staff will maintain their facility's listings. The designated provincial administrator will oversee participating facilities and directory quality.

### 7.4. Confidential Appointment Request System

Users will be able to select a facility, review its requirements, and submit an appointment request.

Where the provider supports it, users might book through a pseudonym or one-time reference rather than create a conventional account. The clinic will receive only the information necessary to process the request.

The initial version will support manual appointment confirmation through a clinic administrator dashboard. This avoids depending on external booking integrations before local providers are ready.

**Purpose:** Give users a direct next step from seeking information to arranging testing.

### 7.5. Appointment Preparation and Neutral Reminders

After a request is confirmed, users will receive the relevant visit instructions, location information, and details about what to expect.

Optional reminders will use neutral wording so that STI or HIV information is not displayed unnecessarily on a shared device's lock screen. Users will control whether reminders are enabled and which supported method is used.

### 7.6. Results and Care Navigation

After testing, the system will explain how users can obtain their results from the participating healthcare provider and where to seek further assistance.

If treatment, additional testing, or follow-up is recommended, the system will display relevant service information and referral options.

The initial version will not store diagnoses or laboratory results. These remain under the care of the healthcare provider.

### 7.7. Administrative Dashboard and Aggregate Reports

Authorized administrators will manage clinic listings, educational content, appointment status, and system operations according to their assigned permissions.

The dashboard will support aggregate reporting on information access, clinic searches, appointment requests, confirmations, and attendance where participating clinics can provide reliable status updates.

Reports will avoid unnecessary personal or clinical information.

## 8. How the System Works

The intended user journey is:

**Suspect Exposure → Search Information → Consider Privacy and Stigma → Find Clinic → Request Appointment → Consult → Get Tested → Receive Results → Seek Treatment if Needed → Follow Up**

The process will work as follows:

1. A user suspects possible exposure or has questions about STIs.
2. The user opens the system and reads relevant information without creating an account.
3. The user selects privacy concerns and reviews the options available to address them.
4. The system displays suitable participating clinics based on verified services, location, and relevant privacy practices.
5. The user reviews the clinic's requirements and submits an appointment request through a supported confidential booking process.
6. Authorized clinic personnel review the request and confirm an appointment or provide alternative instructions.
7. The user attends the clinic, receives professional consultation, and undergoes the appropriate testing.
8. The healthcare provider communicates the results and determines whether treatment, additional testing, or other care is needed.
9. The user accesses follow-up information and optional reminders through the system.

The system will not diagnose users or determine whether a test is medically necessary. These decisions remain with qualified healthcare professionals.

If a user reports a possible recent HIV exposure, the platform must prioritize urgent professional assessment for post-exposure prophylaxis (PEP), rather than requiring the user to complete the normal booking journey first.

## 9. Recommended Technology Stack

The proposed stack balances development simplicity, maintainability, and the system's privacy requirements.

| **Component**      | **Recommended technology**                                            | **Purpose**                                                                                                      |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Frontend           | React and Vite                                                        | Build the student-facing website, clinic directory, privacy-matching interface, and administrator dashboard.     |
| Application format | Progressive Web App (PWA)                                             | Support access through mobile and desktop browsers without requiring an app-store installation.                  |
| Backend            | Node.js and Express                                                   | Process appointment requests, generate booking references, validate inputs, and enforce server-side permissions. |
| Database           | Supabase PostgreSQL                                                   | Store clinic listings, service information, appointment status, staff accounts, and audit records.               |
| Authentication     | Supabase Auth or an equivalent controlled authentication service      | Authenticate authorized administrators and participating clinic personnel.                                       |
| Access control     | Role-based permissions and PostgreSQL Row Level Security              | Restrict users to the records and actions permitted by their roles.                                              |
| Notifications      | Optional email or SMS provider                                        | Send appointment confirmations and neutral reminders where supported.                                            |
| Hosting            | A selected frontend host and suitable backend/database hosting region | Make the system accessible while meeting institutional security, privacy, and operational requirements.          |

### Why This Stack?

React and Vite support a responsive interface suitable for students using mobile devices. Node.js and Express provide a clear separation between the user interface and sensitive appointment operations. Supabase PostgreSQL supports structured healthcare service data and access-control policies.

The system can begin with manual clinic confirmation and expand as participating providers establish their workflows. Automated scheduling and external integrations will only be added when their benefits and operational requirements are clear.

The final hosting arrangement and data flows must be reviewed for compliance with the Philippine Data Privacy Act and applicable health-sector requirements. Selecting a technology platform alone does not guarantee compliance.

## 10. Privacy and Security Measures

Because STI-related activity and health information are sensitive, privacy must be built into the system from the beginning.

The following safeguards are proposed:

1. **No mandatory account for browsing:** Users can read educational materials and search clinics without registering.
2. **Data minimization:** Appointment requests collect only the information needed by the participating provider.
3. **Transparent booking requirements:** The system explains what information the clinic receives before the user submits a request.
4. **Controlled access:** Clinic personnel access only the records needed for their responsibilities.
5. **Secure data transmission and storage:** Appropriate encryption, access controls, backups, and security monitoring will be implemented.
6. **Neutral notifications:** Reminders will avoid unnecessary disclosure of STI or HIV information.
7. **Limited clinical data:** Test results and diagnoses will remain with providers during the initial implementation.
8. **Clear retention policies:** Appointment information will be retained only as long as justified by operational and legal requirements.
9. **Age-appropriate procedures:** Consent, confidentiality, and service requirements for users below 18 will be validated with participating healthcare providers.

Anonymous browsing and confidential appointments are distinct from anonymous testing. The platform will only offer booking methods that participating providers actually support.

## 11. Implementation Roadmap

### Phase 1: Research and Validation

Conduct interviews with students aged 15–24, the PHO, municipal health offices, and potential clinic partners. Identify the most important privacy barriers and verify available services and booking procedures.

**Deliverable:** Validated requirements and a local service map.

### Phase 2: Interface and Workflow Design

Design the information hub, privacy concern selector, clinic profiles, and appointment workflow. Test the interface with representative users before implementing the complete system.

**Deliverable:** A clickable prototype and reviewed user journey.

### Phase 3: Minimum Viable System Development

Build the core website, clinic directory, privacy-matching feature, appointment request module, and administrator dashboard. Use manual appointment confirmation where necessary.

**Deliverable:** A functional system ready for controlled pilot testing.

### Phase 4: Pilot Implementation

Run a limited pilot with consenting users and participating facilities in Marinduque. Provide administrator training and establish procedures for updating listings and confirming appointments.

**Deliverable:** A functioning pilot with documented operational procedures.

### Phase 5: Evaluation and Improvement

Measure user engagement, appointment requests, confirmed appointments, reported attendance, usability, and perceived privacy. Investigate points where users abandon the process.

**Deliverable:** An evaluation report and prioritized improvements.

### Phase 6: Expansion

Based on pilot findings, improve the pathway and invite additional participating facilities. Consider automated scheduling, expanded referral support, and optional follow-up integrations as the local network develops.

**Deliverable:** A more comprehensive provincial service-navigation platform.

## 12. Evaluation and Success Metrics

The primary outcome is whether the system helps users progress from accessing STI information to attending a professional testing appointment.

| **Indicator**                     | **What it measures**                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Information engagement            | Whether users access relevant STI information and testing guidance.                                                                               |
| Clinic search engagement          | Whether users proceed from information pages to clinic profiles.                                                                                  |
| Appointment request rate          | The proportion of eligible clinic-search sessions that lead to a submitted request, using an appropriately privacy-preserving measurement method. |
| Confirmation rate                 | The proportion of appointment requests confirmed by participating clinics.                                                                        |
| Attendance rate                   | The proportion of confirmed appointments reported as attended by participating clinics.                                                           |
| Privacy confidence                | Whether users report greater confidence in understanding confidentiality and booking requirements.                                                |
| User experience                   | Whether users find the platform understandable, discreet, and easy to use.                                                                        |
| Referral and follow-up engagement | Whether users access recommended care information after testing, where measurable without unnecessary collection of sensitive data.               |

Baseline values and pilot targets will be established before launch. Increased testing uptake will be treated as an outcome to evaluate, not a guaranteed effect of the technology.

## 13. Sustainability and Marketability

The proposed business model is **Business-to-Business-to-Consumer (B2B2C)**.

Students and members of the public will have free access to essential STI information and clinic navigation. Institutions may fund the platform to support health education and service coordination.

Potential institutional partners and customers include:

- Provincial and municipal health offices.
- Universities, colleges, and other educational institutions.
- Hospitals and participating clinics.
- NGOs and public health organizations.

Possible paid services include administrative dashboards, clinic listing management, campaign tools, and aggregate reporting. Public-health sponsorships and grants could support implementation in areas where institutions lack dedicated budgets.

Institutions would have a reason to support the system if it demonstrably improves service visibility, reduces avoidable coordination work, and provides useful aggregate information about outreach and referral engagement.

The market opportunity remains to be validated through partner interviews, pilot agreements, and evidence of willingness to pay.

## 14. Scope and Limitations

The initial system will focus on education, privacy-focused clinic matching, confidential appointment requests, and navigation to professional care.

It will not diagnose STIs, replace clinical consultation, independently interpret laboratory results, guarantee anonymous testing, or assume that every clinic supports online scheduling.

Automated appointment integrations, home testing, telemedicine, digital results, and detailed clinical record management are outside the initial scope. They will be considered only after appropriate clinical partnerships, operational procedures, and privacy safeguards are established.

The project's effectiveness will depend on the accuracy of clinic information, the availability of participating facilities, the reliability of appointment confirmation, user trust, and the willingness of institutions to maintain the service.

## 15. Expected Outcomes

The project is expected to provide young people with a more direct and privacy-conscious route to professional STI testing.

Expected benefits include improved access to reliable information, greater understanding of clinic confidentiality procedures, easier identification of appropriate services, and a more organized appointment-request process.

For participating institutions, the system will provide a centralized way to maintain service information, coordinate appointment requests, and evaluate outreach activity through aggregate indicators.

These outcomes must be assessed during the pilot. The system's long-term value will depend on whether it meaningfully reduces barriers and helps more users complete the steps needed to obtain appropriate healthcare.

## 16. Conclusion

The Privacy-Matched STI Testing Navigation and Appointment System is a proposed digital health intervention for young people aged 15–24, initially targeting high school and college students in Marinduque.

Its central goal is to help users move from suspected exposure and uncertainty to professional testing by reducing informational, privacy, stigma-related, and service-navigation barriers.

The project's defining feature is its Privacy-Matched Testing Pathway, which connects individual concerns with verified clinic information and supported confidential booking procedures. Combined with a clinic directory, appointment-request workflow, administrator dashboard, and follow-up navigation, this approach provides a practical link between health awareness and healthcare access.

The proposed React, Node.js, and Supabase technology stack supports an initial implementation without requiring a native mobile application or complex clinical integrations.

Ultimately, the project's success will be measured by whether users feel more confident seeking care, whether participating clinics can reliably support the workflow, and whether more users progress from searching for information to attending professional testing appointments.

## References

[1] J. C. Paunan, “PH reports 4,633 new HIV cases in first quarter of 2026; awareness campaign promotes prevention,” Philippine Information Agency, July 9, 2026. Available:[ https://pia.gov.ph/news/ph-reports-4633-new-hiv-cases-in-first-quarter-of-2026-awareness-campaign-promotes-prevention/](https://pia.gov.ph/news/ph-reports-4633-new-hiv-cases-in-first-quarter-of-2026-awareness-campaign-promotes-prevention/)

[2] H. J. L. Lopez et al., “Knowledge, attitude and practice on sexually transmitted infections among men and women aged 15–24 years old in Sampaloc, Manila,” *Journal of Medicine, University of Santo Tomas*, vol. 10, no. 1, 2026. doi: 10.35460/2546-1621.2025-0235.

[3] L. E. Santos, K. Peltzer, E. F. Mallari, T.-T. Nguyen-Thi, and H.-T. Luu-Thi, “Comprehensive HIV knowledge, stigma and associated sexual risk behaviors among sexually active adolescent girls and young women in the Philippines,” *AIDS Care*, vol. 37, no. 6, pp. 955–966, 2025. doi: 10.1080/09540121.2025.2475217.

[4] W. Riabroi, B. Gregory, D. Mackay, and E. Germeni, “Understanding barriers to young people's utilisation of sexual and reproductive health services in Asia-Pacific countries: A qualitative systematic review and thematic synthesis,” *BMJ Public Health*, vol. 3, no. 1, Art. no. e001504, 2025. doi: 10.1136/bmjph-2024-001504.

[5] J. L. G. Dinglasan, J. D. T. Rosadiño, R. Pagtakhan, D. P. Cruz, M. T. Briñes, Z. J. G. Regencia, and E. S. Baja, “‘Bringing testing closer to you’: Barriers and facilitators in implementing HIV self-testing among Filipino men-having-sex-with-men and transgender women in National Capital Region (NCR), Philippines: A qualitative study,” *BMJ Open*, vol. 12, no. 3, Art. no. e056697, 2022. doi: 10.1136/bmjopen-2021-056697.

[6] M. M. Arellano et al., “Systematic review on the status of sexually transmitted infections (STI) in the Philippines: Challenges and opportunities,” *Asian Journal of Biological and Life Sciences*, vol. 10, no. 1, pp. 81–86, 2021. doi: 10.5530/ajbls.2021.10.13.

[7] World Health Organization, *Consolidated Guidelines on Differentiated HIV Testing Services*. Geneva, Switzerland: World Health Organization, 2024. Available:[ https://www.ncbi.nlm.nih.gov/books/NBK605628/](https://www.ncbi.nlm.nih.gov/books/NBK605628/)
