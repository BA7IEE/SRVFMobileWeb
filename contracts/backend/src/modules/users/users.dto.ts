export class ChangeMyPasswordDto {
  @ApiProperty({
    description: '当前密码;校验失败抛 OLD_PASSWORD_INVALID(10005)',
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  oldPassword!: string;

  @ApiProperty({
    description:
      '新密码(至少 8 位,需含字母+数字);若与 oldPassword 完全相同抛 NEW_PASSWORD_SAME_AS_OLD(10006)',
    format: 'password',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/, {
    message: 'password 至少 8 位,且必须包含字母和数字',
  })
  newPassword!: string;
}
