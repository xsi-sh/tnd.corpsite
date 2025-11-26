export interface ESIWalletJournal {
  date: string;
  ref_id: number;
  ref_type_id: number;
  first_party_id: number;
  second_party_id: number;
  amount: number;
  balance: number;
  reason?: string;
  tax_receiver_id?: number;
  tax?: number;
}

export interface ESIPublicInfo {
  birthday: string;
  bloodline_id: number;
  corporation_id: number;
  description: string;
  gender: string;
  name: string;
  race_id: number;
  security_status: number;
  title?: string;
}

export interface ESILocation {
  solar_system_id: number;
  station_id?: number;
  structure_id?: number;
}
