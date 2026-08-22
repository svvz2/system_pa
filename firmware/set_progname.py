Import("env")

# Wokwi can keep the previous firmware.elf open on Windows. Building under a
# second program name lets PlatformIO reuse its cache without a file-lock race.
env.Replace(PROGNAME="firmware_wokwi")
