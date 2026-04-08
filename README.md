# TigerBus

A mobile app for navigating LSU bus routes, built with React Native and Expo.

## Prerequisites

- [Node.js](https://nodejs.org/) installed on your machine
- [Expo Go](https://expo.dev/go) installed on your phone
  - [iOS – App Store](https://apps.apple.com/app/expo-go/id982107779)
  - [Android – Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)

## Running the App

1. **Navigate to the app directory**

   ```bash
   cd tigerbus
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start the development server**

   ```bash
   npx expo start
   ```

4. **Open on your phone**

   - A QR code will appear in the terminal
   - **iOS:** Open the Camera app and scan the QR code
   - **Android:** Open the Expo Go app and tap "Scan QR code", then scan it

   The app will load on your phone through Expo Go.

## Notes

- Your phone and computer must be on the same Wi-Fi network
- If the QR code scan doesn't connect, try pressing `s` in the terminal to switch to Expo Go tunnel mode
