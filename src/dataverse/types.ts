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
  groupId?: string
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
  groupId?: string
  groupName?: string
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
  createdOn?: string
  statusLabel?: string
}

export type CreatePaxGroupResult = {
  id?: string
  odataId?: string
  groupName?: string
}
