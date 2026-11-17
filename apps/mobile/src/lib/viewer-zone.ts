/** The device's IANA zone. */
export const viewerZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
