import type { Coords } from './types'

// Main railway stations and tourist railheads across India, used when the live
// map lookup fails or finds nothing. Positions are approximate (a few km), which
// is plenty: they only feed rough road-time estimates, never navigation.
// [name, latitude, longitude]
const RAW: [string, number, number][] = [
  // Tamil Nadu, Kerala, Karnataka
  ['Kodaikanal Road', 10.38, 77.88], ['Palani', 10.45, 77.52], ['Dindigul Junction', 10.36, 77.97], ['Madurai Junction', 9.919, 78.113],
  ['Coimbatore Junction', 10.999, 76.966], ['Mettupalayam', 11.299, 76.942], ['Coonoor', 11.351, 76.796], ['Udhagamandalam (Ooty)', 11.408, 76.695],
  ['Pollachi Junction', 10.659, 77.009], ['Salem Junction', 11.664, 78.157], ['Erode Junction', 11.341, 77.727], ['Tiruchirappalli Junction', 10.807, 78.687],
  ['Thanjavur Junction', 10.781, 79.14], ['Chidambaram', 11.404, 79.693], ['Villupuram Junction', 11.939, 79.494], ['Chennai Central', 13.082, 80.275],
  ['Chennai Egmore', 13.078, 80.261], ['Katpadi Junction', 12.969, 79.136], ['Tirupati', 13.627, 79.419], ['Rameswaram', 9.289, 79.317],
  ['Tirunelveli Junction', 8.728, 77.717], ['Nagercoil Junction', 8.179, 77.435], ['Kanyakumari', 8.089, 77.55],
  ['Thiruvananthapuram Central', 8.488, 76.953], ['Varkala Sivagiri', 8.734, 76.716], ['Kollam Junction', 8.886, 76.592], ['Alappuzha', 9.487, 76.324],
  ['Kottayam', 9.593, 76.523], ['Ernakulam Junction', 9.969, 76.291], ['Aluva', 10.109, 76.35], ['Thrissur', 10.517, 76.215],
  ['Kozhikode', 11.248, 75.784], ['Kannur', 11.869, 75.372], ['Mangaluru Central', 12.87, 74.841], ['Udupi', 13.343, 74.748],
  ['Kumta', 14.429, 74.417], ['Karwar', 14.813, 74.129], ['Bengaluru City', 12.978, 77.57], ['Mysuru Junction', 12.317, 76.642],
  ['Hassan', 13.007, 76.093], ['Sakleshpur', 12.946, 75.785], ['Hosapete Junction', 15.269, 76.39], ['Badami', 15.917, 75.685],
  ['Hubballi Junction', 15.359, 75.137], ['Belagavi', 15.86, 74.51], ['Bidar', 17.91, 77.519],
  // Goa and Maharashtra
  ['Madgaon', 15.268, 73.957], ['Karmali', 15.472, 73.908], ['Thivim', 15.602, 73.835], ['Vasco da Gama', 15.399, 73.824],
  ['Sawantwadi Road', 15.943, 73.82], ['Kudal', 16.013, 73.69], ['Ratnagiri', 16.991, 73.3], ['Chiplun', 17.526, 73.518], ['Khed', 17.722, 73.392],
  ['Mumbai CSMT', 18.94, 72.835], ['Mumbai Central', 18.969, 72.819], ['Dadar', 19.019, 72.843], ['Thane', 19.186, 72.971], ['Kalyan Junction', 19.236, 73.13],
  ['Panvel', 18.991, 73.119], ['Neral Junction', 19.023, 73.319], ['Karjat', 18.91, 73.323], ['Lonavala', 18.753, 73.406], ['Pune Junction', 18.529, 73.874],
  ['Satara', 17.682, 74.017], ['Karad', 17.287, 74.18], ['Kolhapur', 16.7, 74.233], ['Miraj Junction', 16.826, 74.644], ['Solapur', 17.674, 75.906],
  ['Igatpuri', 19.696, 73.563], ['Nashik Road', 19.95, 73.833], ['Manmad Junction', 20.254, 74.437], ['Shirdi (Sainagar)', 19.769, 74.479],
  ['Aurangabad', 19.867, 75.321], ['Jalgaon Junction', 21.015, 75.562], ['Bhusawal Junction', 21.045, 75.785], ['Akola Junction', 20.71, 77.0035],
  ['Nagpur Junction', 21.152, 79.088], ['Gondia Junction', 21.461, 80.2], ['Chandrapur', 19.956, 79.296],
  // North
  ['New Delhi', 28.642, 77.219], ['Old Delhi', 28.661, 77.228], ['Hazrat Nizamuddin', 28.589, 77.254], ['Agra Cantt', 27.158, 77.989], ['Mathura Junction', 27.478, 77.674],
  ['Haridwar Junction', 29.946, 78.171], ['Rishikesh (Yog Nagari)', 30.099, 78.282], ['Dehradun', 30.325, 78.033], ['Kotdwar', 29.745, 78.529],
  ['Ramnagar (Corbett)', 29.398, 79.12], ['Kathgodam', 29.27, 79.533], ['Ambala Cantt', 30.347, 76.833], ['Chandigarh', 30.708, 76.82], ['Kalka', 30.836, 76.936],
  ['Shimla', 31.101, 77.166], ['Una Himachal', 31.466, 76.267], ['Joginder Nagar', 31.993, 76.787], ['Pathankot', 32.269, 75.643], ['Amritsar Junction', 31.636, 74.87],
  ['Jammu Tawi', 32.708, 74.876], ['Udhampur', 32.922, 75.142], ['Katra (Vaishno Devi)', 32.991, 74.946],
  ['Lucknow Charbagh', 26.831, 80.924], ['Kanpur Central', 26.453, 80.351], ['Prayagraj Junction', 25.444, 81.827], ['Varanasi Junction', 25.327, 82.987],
  ['Ayodhya', 26.796, 82.198], ['Gorakhpur Junction', 26.751, 83.379],
  // Rajasthan, Gujarat, Madhya Pradesh, Chhattisgarh
  ['Jaipur Junction', 26.919, 75.788], ['Sawai Madhopur', 26.013, 76.352], ['Ajmer Junction', 26.453, 74.644], ['Udaipur City', 24.578, 73.706],
  ['Abu Road', 24.481, 72.78], ['Jodhpur Junction', 26.289, 73.022], ['Jaisalmer', 26.915, 70.915], ['Bikaner Junction', 28.016, 73.313],
  ['Ahmedabad (Kalupur)', 23.027, 72.601], ['Vadodara Junction', 22.31, 73.181], ['Surat', 21.205, 72.84], ['Rajkot Junction', 22.303, 70.797],
  ['Junagadh Junction', 21.52, 70.457], ['Veraval (Somnath)', 20.904, 70.368], ['Dwarka', 22.24, 68.968], ['Bhavnagar Terminus', 21.756, 72.151], ['Bhuj', 23.248, 69.667],
  ['Gwalior Junction', 26.217, 78.182], ['Jhansi Junction', 25.442, 78.579], ['Khajuraho', 24.853, 79.928], ['Satna', 24.59, 80.833], ['Umaria', 23.526, 80.833],
  ['Jabalpur Junction', 23.168, 79.937], ['Bhopal Junction', 23.268, 77.413], ['Ujjain Junction', 23.183, 75.775], ['Indore Junction', 22.717, 75.868],
  ['Raipur Junction', 21.254, 81.629], ['Bilaspur Junction', 22.074, 82.138],
  // East and North-east
  ['Patna Junction', 25.6, 85.138], ['Gaya Junction', 24.799, 84.983], ['Ranchi', 23.373, 85.325], ['Tatanagar (Jamshedpur)', 22.771, 86.204],
  ['Howrah Junction', 22.584, 88.342], ['Sealdah', 22.567, 88.37], ['Bolpur (Shantiniketan)', 23.672, 87.688], ['Canning (Sundarbans)', 22.315, 88.661],
  ['Digha', 21.628, 87.55], ['New Jalpaiguri', 26.683, 88.425], ['Siliguri Junction', 26.71, 88.429], ['Darjeeling', 27.042, 88.264],
  ['Bhubaneswar', 20.265, 85.843], ['Puri', 19.798, 85.828], ['Balugaon (Chilika)', 19.766, 85.106], ['Guwahati', 26.181, 91.751], ['Dibrugarh', 27.479, 94.911],
  // Andhra Pradesh, Telangana
  ['Visakhapatnam Junction', 17.722, 83.289], ['Araku', 18.333, 82.878], ['Vijayawada Junction', 16.519, 80.62],
  ['Secunderabad Junction', 17.434, 78.501], ['Hyderabad Deccan (Nampally)', 17.391, 78.47], ['Warangal', 17.978, 79.603],
]

export interface Station {
  name: string
  coords: Coords
}

export const STATIONS: Station[] = RAW.map(([name, lat, lon]) => ({ name, coords: { lat, lon } }))
