export type PassengerRequest = {
  surname: string
  forenames: string
  serviceStaffNumber?: string
  militaryCivilianLabel?: string
  genderLabel?: string
  dateOfBirth?: string
  documentTypeLabel: string
  documentNumber: string
  passportNumber?: string
  passportIssueDate?: string
  passportExpiryDate?: string
  visaNumber?: string
  visaIssueDate?: string
  visaExpiryDate?: string
  nationalityId?: string
  passportCountryOfIssueId?: string
  visaCountryOfIssueId?: string
  purposeOfTravelId?: string
  fromId?: string
  toId?: string
  authoriserId?: string
  disabilityId?: string
  mealDietaryId?: string
  mealDetails?: string
  amed?: boolean
  amedDetails?: string
  allergy?: boolean
  allergyDetails?: string
  severity?: string
  specialRequests?: string
  pointOfContactName?: string
  contactEmailAddress?: string
  contactNumberWorkingHours?: string
  contactNumberOutOfHours?: string
  emergencyContactNumber?: string
  paxPhoneNumber?: string
  emailOfTraveller?: string
  departingOn: string
  returningOn: string
  departingFromIata: string
  destinationIata: string
  transportRequestStatusLabel?: string
  groupId?: string
}

export type PassengerRequestListItem = {
  id?: string
  odataId?: string
  etag?: string
  surname?: string
  forenames?: string
  serviceStaffNumber?: string
  militaryCivilianLabel?: string
  genderLabel?: string
  dateOfBirth?: string
  documentTypeLabel?: string
  documentNumber?: string
  passportNumber?: string
  passportIssueDate?: string
  passportExpiryDate?: string
  visaNumber?: string
  visaIssueDate?: string
  visaExpiryDate?: string
  nationalityName?: string
  passportCountryOfIssueName?: string
  visaCountryOfIssueName?: string
  purposeOfTravelName?: string
  disabilityName?: string
  mealDietaryName?: string
  mealDetails?: string
  amed?: boolean
  amedDetails?: string
  allergy?: boolean
  allergyDetails?: string
  severity?: string
  specialRequests?: string
  pointOfContactName?: string
  contactEmailAddress?: string
  contactNumberWorkingHours?: string
  contactNumberOutOfHours?: string
  emergencyContactNumber?: string
  paxPhoneNumber?: string
  emailOfTraveller?: string
  departingFromIata?: string
  destinationIata?: string
  transportRequestStatusLabel?: string
  departingOn?: string
  returningOn?: string
  createdOn?: string
  groupId?: string
  groupName?: string
  authoriserId?: string
  createdById?: string
}

export type AuthoriserListItem = {
  id?: string
  odataId?: string
  etag?: string
  authoriserName?: string
  email?: string
  bookingOfficeId?: string
  bookingOfficeName?: string
}

export type CreatePassengerRequestResult = {
  id?: string
  referenceName?: string
}

export type PaxGroup = {
  id?: string
  odataId?: string
  etag?: string
  name: string
  passengerCount: number
  leadPassengerName: string
}

export type PaxGroupListItem = {
  id?: string
  odataId?: string
  etag?: string
  name?: string
  passengerCount?: number
  departingOn?: string
  createdOn?: string
  statusLabel?: string
  authoriserId?: string
}

export type CreatePaxGroupResult = {
  id?: string
  odataId?: string
  groupName?: string
}

export type LookupOption = {
  id: string
  name: string
}

export type PassengerComment = {
  id: string
  subject?: string
  text: string
  createdOn?: string
  createdBy?: string
}

export type ExternalPassengerContact = {
  id: string
  odataId?: string
  etag?: string
  email: string
  firstName?: string
  lastName?: string
}

export type AuthorisationRecord = {
  id?: string
  odataId?: string
  etag?: string
  passengerBookingId: string
  authorisationReference: string
  authoriserName: string
  contactNumber: string
  dateOfAuthorisation: string
  email: string
  uin: string
  receivingUnitOrFamilyAddress: string
  purposeOfTravelCodeId: string
  rankGradeId: string
  serviceCodeId: string
  travelCodeId: string
  jfetNo?: string
  jpan?: string
  alternativeExceptionalAuthority?: string
  reasonForTravelVisit?: string
  specialRequests?: string
  authorisationStatusLabel?: string
  bookingOfficeId?: string
  stateCode?: number
  statusCode?: number
}
