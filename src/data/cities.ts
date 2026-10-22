import type { City } from './types'

// Common starting cities. Destinations in destinations.ts can also be used
// as a starting point (for example Pune → Lonavala, or Manali → Kasol).
export const CITIES: City[] = [
  { id: 'mumbai', name: 'Mumbai', airport: 'BOM', aliases: ['bombay'], state: 'Maharashtra', coords: { lat: 19.076, lon: 72.8777 } },
  { id: 'pune', name: 'Pune', airport: 'PNQ', aliases: ['poona'], state: 'Maharashtra', coords: { lat: 18.5204, lon: 73.8567 } },
  { id: 'nashik', name: 'Nashik', airport: 'ISK', state: 'Maharashtra', coords: { lat: 19.9975, lon: 73.7898 } },
  { id: 'nagpur', name: 'Nagpur', airport: 'NAG', state: 'Maharashtra', coords: { lat: 21.1458, lon: 79.0882 } },
  { id: 'delhi', name: 'Delhi', airport: 'DEL', aliases: ['new delhi', 'ncr', 'gurgaon', 'gurugram', 'noida'], state: 'Delhi', coords: { lat: 28.6139, lon: 77.209 } },
  { id: 'bengaluru', name: 'Bengaluru', airport: 'BLR', aliases: ['bangalore', 'blr'], state: 'Karnataka', coords: { lat: 12.9716, lon: 77.5946 } },
  { id: 'mysuru', name: 'Mysuru', airport: 'MYQ', aliases: ['mysore'], state: 'Karnataka', coords: { lat: 12.2958, lon: 76.6394 } },
  { id: 'hyderabad', name: 'Hyderabad', airport: 'HYD', aliases: ['secunderabad'], state: 'Telangana', coords: { lat: 17.385, lon: 78.4867 } },
  { id: 'chennai', name: 'Chennai', airport: 'MAA', aliases: ['madras'], state: 'Tamil Nadu', coords: { lat: 13.0827, lon: 80.2707 } },
  { id: 'coimbatore', name: 'Coimbatore', airport: 'CJB', state: 'Tamil Nadu', coords: { lat: 11.0168, lon: 76.9558 } },
  { id: 'kochi', name: 'Kochi', airport: 'COK', aliases: ['cochin', 'ernakulam'], state: 'Kerala', coords: { lat: 9.9312, lon: 76.2673 } },
  { id: 'kolkata', name: 'Kolkata', airport: 'CCU', aliases: ['calcutta'], state: 'West Bengal', coords: { lat: 22.5726, lon: 88.3639 } },
  { id: 'ahmedabad', name: 'Ahmedabad', airport: 'AMD', state: 'Gujarat', coords: { lat: 23.0225, lon: 72.5714 } },
  { id: 'surat', name: 'Surat', airport: 'STV', state: 'Gujarat', coords: { lat: 21.1702, lon: 72.8311 } },
  { id: 'chandigarh', name: 'Chandigarh', airport: 'IXC', state: 'Chandigarh', coords: { lat: 30.7333, lon: 76.7794 } },
  { id: 'dehradun', name: 'Dehradun', airport: 'DED', state: 'Uttarakhand', coords: { lat: 30.3165, lon: 78.0322 } },
  { id: 'lucknow', name: 'Lucknow', airport: 'LKO', state: 'Uttar Pradesh', coords: { lat: 26.8467, lon: 80.9462 } },
  { id: 'indore', name: 'Indore', airport: 'IDR', state: 'Madhya Pradesh', coords: { lat: 22.7196, lon: 75.8577 } },
  { id: 'bhopal', name: 'Bhopal', airport: 'BHO', state: 'Madhya Pradesh', coords: { lat: 23.2599, lon: 77.4126 } },
  { id: 'patna', name: 'Patna', airport: 'PAT', state: 'Bihar', coords: { lat: 25.5941, lon: 85.1376 } },
  { id: 'bhubaneswar', name: 'Bhubaneswar', airport: 'BBI', state: 'Odisha', coords: { lat: 20.2961, lon: 85.8245 } },
  { id: 'visakhapatnam', name: 'Visakhapatnam', airport: 'VTZ', aliases: ['vizag'], state: 'Andhra Pradesh', coords: { lat: 17.6868, lon: 83.2185 } },
  { id: 'guwahati', name: 'Guwahati', airport: 'GAU', state: 'Assam', coords: { lat: 26.1445, lon: 91.7362 } },
]
