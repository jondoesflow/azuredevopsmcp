export type PassengerRequest = {
  surname: string
  forenames: string
  documentTypeLabel: string
  documentNumber: string
  departingOn: string
  returningOn: string
  departingFromIata: string
  destinationIata: string
  transportRequestStatusLabel?: string
}

export type PassengerRequestListItem = {
  id?: string
  odataId?: string
  etag?: string
  surname?: string
  forenames?: string
  departingFromIata?: string
  destinationIata?: string
  transportRequestStatusLabel?: string
  departingOn?: string
  returningOn?: string
  createdOn?: string
}

export type CreatePassengerRequestResult = {
  id?: string
}
