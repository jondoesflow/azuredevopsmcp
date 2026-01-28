export type Airport = {
  iata: string
  name: string
  city: string
  country: string
}

export const AIRPORTS: Airport[] = [
  { iata: 'EGWU', name: 'RAF Northolt', city: 'London', country: 'United Kingdom' },
  { iata: 'EGVN', name: 'RAF Brize Norton', city: 'Carterton', country: 'United Kingdom' },
  { iata: 'EGQS', name: 'RAF Lossiemouth', city: 'Lossiemouth', country: 'United Kingdom' },
  { iata: 'EGXC', name: 'RAF Coningsby', city: 'Coningsby', country: 'United Kingdom' },
  { iata: 'EGYM', name: 'RAF Marham', city: 'Marham', country: 'United Kingdom' },
  { iata: 'EGXW', name: 'RAF Waddington', city: 'Lincoln', country: 'United Kingdom' },
  { iata: 'EGXE', name: 'RAF Leeming', city: 'Leeming', country: 'United Kingdom' },
  { iata: 'EGOS', name: 'RAF Shawbury', city: 'Shawbury', country: 'United Kingdom' },
  { iata: 'EGXH', name: 'RAF Honington', city: 'Honington', country: 'United Kingdom' },
  { iata: 'EGYD', name: 'RAF Cranwell', city: 'Cranwell', country: 'United Kingdom' },
  { iata: 'EGOV', name: 'RAF Valley', city: 'Anglesey', country: 'United Kingdom' },
  { iata: 'EGVO', name: 'RAF Odiham', city: 'Odiham', country: 'United Kingdom' },
  { iata: 'EGUB', name: 'RAF Benson', city: 'Wallingford', country: 'United Kingdom' },
  { iata: 'EGUL', name: 'RAF Lakenheath', city: 'Lakenheath', country: 'United Kingdom' },
  { iata: 'EGUN', name: 'RAF Mildenhall', city: 'Mildenhall', country: 'United Kingdom' },
  { iata: 'LXGB', name: 'RAF Gibraltar', city: 'Gibraltar', country: 'Gibraltar' },
  { iata: 'LCRA', name: 'RAF Akrotiri', city: 'Akrotiri', country: 'Cyprus' },
  { iata: 'FHAW', name: 'RAF Ascension Island', city: 'Ascension Island', country: 'Saint Helena, Ascension and Tristan da Cunha' },
  { iata: 'EGYP', name: 'RAF Mount Pleasant', city: 'Falkland Islands', country: 'Falkland Islands' },
  { iata: 'OMDM', name: 'Al Minhad Air Base (RAF presence)', city: 'Dubai', country: 'United Arab Emirates' },
  { iata: 'LHR', name: 'Heathrow', city: 'London', country: 'United Kingdom' },
  { iata: 'LGW', name: 'Gatwick', city: 'London', country: 'United Kingdom' },
  { iata: 'MAN', name: 'Manchester', city: 'Manchester', country: 'United Kingdom' },
  { iata: 'BHX', name: 'Birmingham', city: 'Birmingham', country: 'United Kingdom' },
  { iata: 'EDI', name: 'Edinburgh', city: 'Edinburgh', country: 'United Kingdom' },
  { iata: 'GLA', name: 'Glasgow', city: 'Glasgow', country: 'United Kingdom' },
  { iata: 'DUB', name: 'Dublin', city: 'Dublin', country: 'Ireland' },
  { iata: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'France' },
  { iata: 'AMS', name: 'Schiphol', city: 'Amsterdam', country: 'Netherlands' },
  { iata: 'FRA', name: 'Frankfurt', city: 'Frankfurt', country: 'Germany' },
  { iata: 'MAD', name: 'Madrid-Barajas', city: 'Madrid', country: 'Spain' },
  { iata: 'BCN', name: 'Barcelona-El Prat', city: 'Barcelona', country: 'Spain' },
  { iata: 'FCO', name: 'Fiumicino', city: 'Rome', country: 'Italy' },
  { iata: 'ZRH', name: 'Zurich', city: 'Zurich', country: 'Switzerland' },
  { iata: 'JFK', name: 'John F. Kennedy International', city: 'New York', country: 'USA' },
  { iata: 'EWR', name: 'Newark Liberty International', city: 'Newark', country: 'USA' },
  { iata: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'USA' },
  { iata: 'DXB', name: 'Dubai International', city: 'Dubai', country: 'UAE' },
  { iata: 'DOH', name: 'Hamad International', city: 'Doha', country: 'Qatar' },
  { iata: 'SIN', name: 'Changi', city: 'Singapore', country: 'Singapore' },
]

export function formatAirport(a: Airport): string {
  return `${a.city} (${a.iata}) — ${a.name}`
}
