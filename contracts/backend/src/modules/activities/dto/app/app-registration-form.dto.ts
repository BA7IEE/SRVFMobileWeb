export class AppRegistrationFormChoiceDto {
  @ApiProperty()
  value!: string;

  @ApiProperty()
  label!: string;
}

/** Safe read DTO: no field/version row id, hash, workflow revision or timestamps. */
export class AppRegistrationFormFieldDto {
  @ApiProperty()
  fieldCode!: string;

  @ApiProperty({ enum: REGISTRATION_FORM_FIELD_TYPES })
  typeCode!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  helpText!: string | null;

  @ApiProperty()
  required!: boolean;

  @ApiProperty({ enum: REGISTRATION_FORM_FIELD_VISIBILITIES })
  visibilityCode!: string;

  @ApiProperty()
  exportable!: boolean;

  @ApiProperty()
  sortOrder!: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  minValue!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  maxValue!: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  minLength!: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  maxLength!: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  maxSelections!: number | null;

  @ApiPropertyOptional({ nullable: true, type: () => [AppRegistrationFormChoiceDto] })
  options!: AppRegistrationFormChoiceDto[] | null;
}

export class AppRegistrationFormDto {
  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ type: () => [AppRegistrationFormFieldDto] })
  fields!: AppRegistrationFormFieldDto[];
}
