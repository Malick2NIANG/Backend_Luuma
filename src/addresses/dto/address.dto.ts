import {
  IsBoolean,
  IsISO31661Alpha2,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  /**
   * « Domicile », « Bureau », « Chez ma sœur ».
   *
   * Une adresse sans nom oblige à relire la rue entière pour la reconnaître
   * dans une liste. Le libellé est ce qu'on voit au moment de commander.
   */
  @IsString()
  @IsNotEmpty({ message: 'Donnez un nom à cette adresse.' })
  @MaxLength(40)
  label!: string;

  @IsString()
  @MinLength(5, { message: "L'adresse est trop courte." })
  @MaxLength(300)
  address!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  /**
   * Code ISO à deux lettres, validé comme tel.
   *
   * La recherche de GP compare ce code à `destCountry` des trajets : une
   * saisie libre — « France », « FR », « fra » — ne correspondrait à rien et
   * l'écran paraîtrait vide alors que des GP existent.
   */
  @IsISO31661Alpha2({ message: 'Code pays invalide (deux lettres, ex. FR).' })
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postCode?: string;

  /** Première adresse mise par défaut d'office, voir AddressesService. */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

/** Tous les champs facultatifs : on modifie souvent une seule ligne. */
export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Donnez un nom à cette adresse.' })
  @MaxLength(40)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(5, { message: "L'adresse est trop courte." })
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsISO31661Alpha2({ message: 'Code pays invalide (deux lettres, ex. FR).' })
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postCode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
