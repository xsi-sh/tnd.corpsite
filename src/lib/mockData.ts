// Mock data for development/testing without EVE Online authentication

export const mockCharacterData = {
  character_id: 93686951,
  name: "Test Pilot",
  date_of_birth: "2015-01-10T17:18:31Z",
  security_status: 4.5,
  corporation_id: 98765432,
  alliance_id: 12345678,
  birthday: "2015-01-10T17:18:31Z",
}

export const mockWallet = 2500000000 // 2.5 billion ISK

export const mockLocation = {
  solar_system_id: 30002537,
  station_id: 60003760,
}

export const mockShip = {
  ship_id: 1000000001,
  ship_name: "Test Destroyer",
  ship_type_id: 587, // Rifter
}

export const mockSkills = {
  total_sp: 5000000,
  unallocated_sp: 50000,
  skills: [
    { skill_id: 3300, skillpoints_in_skill: 500000, active_skill_level: 3, trained_skill_level: 5 },
    { skill_id: 3301, skillpoints_in_skill: 1000000, active_skill_level: 4, trained_skill_level: 5 },
  ],
}

export const mockAssets = [
  {
    item_id: 1000000001,
    type_id: 34, // Tritanium
    quantity: 50000,
    location_id: 60003760,
    location_type: "station",
  },
  {
    item_id: 1000000002,
    type_id: 35, // Pyerite
    quantity: 30000,
    location_id: 60003760,
    location_type: "station",
  },
  {
    item_id: 1000000003,
    type_id: 44992, // PLEX
    quantity: 50,
    location_id: 60003760,
    location_type: "station",
  },
  {
    item_id: 1000000004,
    type_id: 587, // Rifter
    quantity: 1,
    location_id: 60003760,
    location_type: "station",
  },
]

export const mockWalletJournal = [
  {
    id: 1,
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    ref_type: "mission_reward",
    amount: 500000,
    balance: 2500000000,
    description: "Agent mission reward",
  },
  {
    id: 2,
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    ref_type: "market_transaction",
    amount: -250000,
    balance: 2499750000,
    description: "Market transaction",
  },
  {
    id: 3,
    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    ref_type: "contract_reward",
    amount: 1000000,
    balance: 2500750000,
    description: "Contract reward",
  },
]

export const mockMarketPrices = [
  { type_id: 34, average_price: 5.5, adjusted_price: 5.2 }, // Tritanium
  { type_id: 35, average_price: 8.2, adjusted_price: 7.9 }, // Pyerite
  { type_id: 587, average_price: 500000, adjusted_price: 480000 }, // Rifter
  { type_id: 44992, average_price: 500000000, adjusted_price: 480000000 }, // PLEX
]
