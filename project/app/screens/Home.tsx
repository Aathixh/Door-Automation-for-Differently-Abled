import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { RFValue } from "react-native-responsive-fontsize";
import { LinearGradient } from "expo-linear-gradient";
import Lock from "../../assets/Lock";
import PadLock from "../../assets/PadLock";
import WifiIcon from "../../assets/WifiIcon";
import WifiConnectedIcon from "../../assets/WifiConnectedIcon";
import BatteryIcon from "../../assets/BatteryIcon";
import {
  NavigationProp,
  useFocusEffect,
  useNavigation,
} from "@react-navigation/native";
import { RootStackParamList } from "../types";
import WifiManager from "react-native-wifi-reborn";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoaderKit, { animations } from "react-native-loader-kit";
import Slider from "@react-native-community/slider";
import { discoverESP32 } from "../services/zeroconfService";

const { width, height } = Dimensions.get("window");

const Home = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [doorState, setDoorState] = useState("closed");
  const [connected, setConnected] = useState(false);
  const [batteryPercentage, setBatteryPercentage] = useState("");
  const [esp32IpAddress, setEsp32IpAddress] = useState<string | null>(null);
  const [showExitAlert, setShowExitAlert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetVisible, setResetVisible] = useState(false);
  const resetAnim = useRef(new Animated.Value(0)).current;
  const wifiAnim = useRef(new Animated.Value(0)).current;
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [motorDelay, setMotorDelay] = useState("");
  const [lockDelay, setLockDelay] = useState("");

  useEffect(() => {
    const initialize = async () => {
      await checkStoredIpAddress();
      await checkStoredDoorState();
      await fetchBatteryPercentage();
    };

    initialize();

    const interval = setInterval(() => {
      checkStoredIpAddress();
      checkStoredDoorState();
      fetchBatteryPercentage();
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval); // Cleanup on unmount
  }, [esp32IpAddress]);

  useEffect(() => {
    if (!connected) {
      resetConnectButton();
    }
  }, [connected]);

  useFocusEffect(
    useCallback(() => {
      const backAction = () => {
        setShowExitAlert(true);
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction
      );

      return () => backHandler.remove();
    }, [])
  );

  const fetchBatteryPercentage = async () => {
    if (!esp32IpAddress) return;
    const url = `http://${esp32IpAddress}/battery`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const voltage = data.battery;

        // Define voltage range
        const minVoltage = 3.0;
        const maxVoltage = 4.2;

        // Calculate battery percentage
        let batteryPercentage;
        if (voltage <= minVoltage) {
          batteryPercentage = 0; // Battery is 0% if voltage is below 3.3V
        } else if (voltage >= maxVoltage) {
          batteryPercentage = 100; // Battery is 100% if voltage is above 4.02V
        } else {
          batteryPercentage =
            ((voltage - minVoltage) / (maxVoltage - minVoltage)) * 100;
        }

        setBatteryPercentage(Math.round(batteryPercentage).toString()); // Set battery percentage as integer
        console.log("Battery percentage:", batteryPercentage);
      }
    } catch (error) {
      // Alert.alert("Error", "Unable to fetch battery percentage.");
      console.error("Error fetching battery percentage:", error);
      setBatteryPercentage("");
    }
  };

  const checkStoredDoorState = async () => {
    const storedDoorState = await AsyncStorage.getItem("door_state");
    if (storedDoorState) {
      setDoorState(storedDoorState);
    }
  };

  const checkStoredIpAddress = async () => {
    let storedIpAddress;
    try {
      storedIpAddress = await AsyncStorage.getItem("esp32IpAddress");
      console.log("Stored IP Address:", storedIpAddress);
      if (!storedIpAddress) {
        const discoveredIp = await discoverESP32();
        if (typeof discoveredIp === "string") {
          setEsp32IpAddress(discoveredIp);
        }
      } else {
        setEsp32IpAddress(storedIpAddress);
      }
    } catch (error) {
      console.error("Error during initialization:", error);
    }
    if (storedIpAddress) {
      setEsp32IpAddress(storedIpAddress);
      verifyHomeWifiConnection(storedIpAddress);
    }
  };

  const verifyHomeWifiConnection = useCallback(async (ipAddress: string) => {
    try {
      const currentSSID = await WifiManager.getCurrentWifiSSID();
      const storedSSID = await AsyncStorage.getItem("WifiSSID");
      const response = await fetch(`http://${ipAddress}/ping`);

      // if (currentSSID === storedSSID && response.ok) {
      //   setConnected(true);
      // } else {
      //   setConnected(false);
      //   Alert.alert("Not Connected", "Please connect to Home Wi-Fi.");
      // }
      if (currentSSID !== storedSSID || !response.ok) {
        const discoveredIp = await discoverESP32();
        if (typeof discoveredIp === "string") {
          setEsp32IpAddress(discoveredIp);
          verifyHomeWifiConnection(discoveredIp);
        }
      } else {
        setConnected(true);
        console.log("Home Wi-Fi connection verified.");
      }
    } catch (error: any) {
      setConnected(false);
      console.error("Error verifying Home Wi-Fi connection:", error);
    }
  }, []);

  const toggleDoorLock = async () => {
    const url = `http://${esp32IpAddress}/${
      doorState === "closed" ? "open" : "close"
    }`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout
    try {
      console.log("Toggling door lock...");
      setLoading(true);
      const response = await fetch(url, { signal: controller.signal });
      console.log("Door lock response:", response);
      if (response.ok) {
        const newDoorState = doorState === "closed" ? "open" : "closed";
        setDoorState(newDoorState);
        await AsyncStorage.setItem("door_state", newDoorState);
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        // Alert.alert("Error", "Request timed out. Unable to toggle door lock.");
      } else {
        Alert.alert("Error", "Unable to toggle door lock.");
      }
      console.error("Error toggling door lock:", error);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleExitApp = () => {
    setShowExitAlert(false);
    BackHandler.exitApp();
  };

  const handleCancelExit = () => {
    setShowExitAlert(false);
  };

  const resetESP32 = async () => {
    if (!esp32IpAddress) return;
    const pingUrl = `http://${esp32IpAddress}/ping`;
    const resetUrl = `http://${esp32IpAddress}/reset`;

    try {
      setLoading(true);

      // Ping the ESP32 to check the connection
      const pingResponse = await fetch(pingUrl);
      if (!pingResponse.ok) {
        Alert.alert("Error", "ESP32 is not connected.");
        return;
      }

      // Send the reset command with a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout

      const resetResponse = await fetch(resetUrl, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resetResponse.ok) {
        const responseText = await resetResponse.text();
        if (responseText === "Successfully Reset") {
          Alert.alert("Success", "ESP32 has been reset.");
          await AsyncStorage.removeItem("esp32IpAddress");
          await AsyncStorage.removeItem("WifiSSID");
          setConnected(false);
          setBatteryPercentage("");
        }
      } else {
        Alert.alert("Error", "Failed to reset ESP32.");
      }
    } catch (error: any) {
      // Assuming success if there is a network error or timeout
      if (
        error.name === "AbortError" ||
        error.message.includes("Network request failed")
      ) {
        Alert.alert("Success", "ESP32 has been reset.");
        console.log("ESP32 has been reset.");
        await AsyncStorage.removeItem("esp32IpAddress");
        await AsyncStorage.removeItem("WifiSSID");
        setConnected(false);
        setBatteryPercentage("");
      } else {
        Alert.alert("Error", "Unable to reset ESP32.");
        console.error("Error resetting ESP32:", error);
      }
    } finally {
      setLoading(false);
      // Reset the animation values to ensure the Wi-Fi connect button returns to its original position
      resetConnectButton();
    }
  };

  const toggleResetButton = () => {
    if (resetVisible) {
      Animated.parallel([
        Animated.timing(resetAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(wifiAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setResetVisible(false));
    } else {
      setResetVisible(true);
      Animated.parallel([
        Animated.timing(resetAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(wifiAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const resetConnectButton = () => {
    Animated.parallel([
      Animated.timing(resetAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(wifiAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setResetVisible(false));
  };

  const sendCalibrationData = async () => {
    if (!esp32IpAddress) return;
    const url = `http://${esp32IpAddress}/calibrate`;

    if (!motorDelay || !lockDelay) {
      Alert.alert("Error", "Please enter valid motor and lock delay values.");
      return;
    }
    const data = new URLSearchParams({
      motorDelay: motorDelay,
      lockDelay: lockDelay,
    }).toString();

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: data,
      });

      if (response.ok) {
        Alert.alert("Success", "Calibration data sent successfully!");
        setIsCalibrating(false); // Close the modal
      } else {
        const errorText = await response.text();
        console.error("Error response:", response.status, errorText);
        // Alert.alert("Error", "Failed to send calibration data.");
      }
    } catch (error) {
      console.error("Error sending calibration data:", error);
      // Alert.alert("Error", "Unable to send calibration data.");
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#3E5C76", "#74ACDC"]}
        style={styles.background}
      />
      <Text style={styles.head}>Welcome to ZenLock</Text>
      <Text style={styles.subhead}>
        Your Gateway to a Smarter, Safer and Seamless Home Experience.
      </Text>

      <View style={styles.centerContainer}>
        <TouchableOpacity
          style={styles.outerCircle}
          onPress={toggleDoorLock}
          disabled={!connected || loading}
        >
          {!loading && (
            <View style={{ marginTop: RFValue(50) }}>
              {doorState === "closed" ? <Lock /> : <PadLock />}
            </View>
          )}
          {!loading && (
            <Text style={styles.btnText}>
              {doorState === "closed" ? "Open" : "Close"}
            </Text>
          )}
          {loading && (
            <LoaderKit
              style={{
                width: RFValue(70),
                height: RFValue(70),
                marginTop: RFValue(92),
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
              }}
              name={animations[7]}
              color="black"
            />
          )}

          <View
            style={[
              styles.led,
              {
                backgroundColor: connected
                  ? doorState === "closed"
                    ? "green"
                    : "red"
                  : "#E0D500",
              },
            ]}
          />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.connectBtn,
          {
            transform: [
              {
                translateX: wifiAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -80],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity
          onPress={
            connected
              ? toggleResetButton
              : () => navigation.navigate("WifiScan")
          }
        >
          {connected ? <WifiConnectedIcon /> : <WifiIcon />}
        </TouchableOpacity>
      </Animated.View>

      {connected && resetVisible && (
        <Animated.View
          style={[
            styles.resetBtn,
            {
              transform: [
                {
                  translateX: resetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 50],
                  }),
                },
              ],
              opacity: resetAnim,
            },
          ]}
        >
          <TouchableOpacity onPress={resetESP32} disabled={loading}>
            <Text style={styles.resetBtnText}>Reset</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollViewContent}
        style={styles.scrollViewContainer}
        snapToInterval={width * 0.9}
        decelerationRate="fast"
      >
        <View style={styles.statusItem}>
          <Text
            style={[styles.statusText, { color: connected ? "green" : "red" }]}
          >
            {connected ? "Connected" : "Not Connected"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <BatteryIcon />
            <Text style={styles.batteryPercent}>{batteryPercentage} %</Text>
          </View>
        </View>
        {connected && (
          <View style={styles.statusItem}>
            <TouchableOpacity
              style={{ justifyContent: "center" }}
              onPress={() => setIsCalibrating(true)}
            >
              <Text style={styles.statusText}>Calibrate Door</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={isCalibrating}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCalibrating(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.calibrationModal}>
            <Text style={styles.modalTitle}>Calibrate Door</Text>

            <Text style={styles.sliderLabel}>
              Motor Delay: {Number(motorDelay) / 1000} s
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={2000}
              maximumValue={60000}
              step={100}
              // value={Number(motorDelay)}
              onValueChange={(value) => setMotorDelay(value.toString())}
              minimumTrackTintColor="#3E5C76"
              maximumTrackTintColor="#ccc"
              thumbTintColor="#3E5C76"
            />

            {/* Lock Delay Slider */}
            <Text style={styles.sliderLabel}>
              Lock Delay: {Number(lockDelay) / 1000} s
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={100}
              maximumValue={3000}
              step={25}
              // value={Number(lockDelay)}
              onValueChange={(value) => setLockDelay(value.toString())}
              minimumTrackTintColor="#3E5C76"
              maximumTrackTintColor="#ccc"
              thumbTintColor="#3E5C76"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setIsCalibrating(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={sendCalibrationData}
              >
                <Text style={styles.modalButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showExitAlert}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelExit}
        statusBarTranslucent={true}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Do you want to exit?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={handleCancelExit}
              >
                <Text style={styles.modalButtonText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={handleExitApp}
              >
                <Text style={styles.modalButtonText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Home;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
  },
  background: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: -1,
  },
  centerContainer: {
    bottom: height * 0.13,
    height: height * 0.7,
    flex: 1,
  },
  outerCircle: {
    alignItems: "center",
    top: height * 0.2,
    shadowOffset: {
      width: 5,
      height: 15,
    },
    shadowOpacity: 0.9,
    shadowColor: "#000",
    shadowRadius: 10,
    elevation: 20,
    borderRadius: 110,
    width: width * 0.8,
    height: width * 0.8,
    backgroundColor: "#fff",
  },
  led: {
    top: RFValue(210),
    width: RFValue(35),
    height: RFValue(10),
    borderRadius: RFValue(5),
    position: "absolute",
  },
  head: {
    marginTop: height * 0.1,
    textAlign: "center",
    fontSize: RFValue(30),
    fontFamily: "Poppins-SemiBold",
    height: RFValue(40),
    marginBottom: RFValue(3),
    color: "#fff",
  },
  subhead: {
    textAlign: "center",
    fontSize: RFValue(13),
    fontFamily: "Poppins-Reg",
    marginLeft: RFValue(20),
    marginRight: RFValue(20),
    color: "#fff",
    lineHeight: RFValue(15),
  },
  connectBtn: {
    borderRadius: 50,
    backgroundColor: "#fff",
    width: RFValue(50),
    height: RFValue(50),
    alignItems: "center",
    justifyContent: "center",
    bottom: height * 0.13,
    shadowOffset: {
      width: 5,
      height: 15,
    },
    shadowOpacity: 0.9,
    shadowColor: "#000",
    shadowRadius: 10,
    elevation: 20,
    top: RFValue(80),
    zIndex: 2,
  },
  resetBtn: {
    borderRadius: 50,
    backgroundColor: "#fff",
    width: RFValue(150),
    height: RFValue(50),
    alignItems: "center",
    justifyContent: "center",
    bottom: height * 0.25,
    shadowOffset: {
      width: 5,
      height: 15,
    },
    shadowOpacity: 0.9,
    shadowColor: "#000",
    shadowRadius: 10,
    elevation: 20,
    position: "absolute",
    zIndex: 5,
  },
  resetBtnText: {
    fontSize: RFValue(16),
    fontFamily: "Poppins-Bold",
    color: "red",
  },
  btnText: {
    fontSize: RFValue(32),
    fontFamily: "Poppins-Bold",
  },
  statusText: {
    fontFamily: "Poppins-Bold",
    fontSize: RFValue(18),
  },
  batteryPercent: {
    fontFamily: "Poppins-SemiBold",
    left: RFValue(5),
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.66)",
  },
  modalContent: {
    width: "80%",
    backgroundColor: "white",
    padding: RFValue(20),
    borderRadius: 10,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: RFValue(16),
    fontFamily: "Poppins-Bold",
    marginBottom: RFValue(10),
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  modalButton: {
    flex: 1,
    alignItems: "center",
    padding: 10,
  },
  modalButtonText: {
    fontSize: RFValue(16),
    color: "blue",
    fontFamily: "Poppins-Med",
  },
  statusItem: {
    backgroundColor: "#fff",
    padding: RFValue(10),
    marginHorizontal: RFValue(5),
    borderRadius: RFValue(10),
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: {
      width: 2,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowColor: "#000",
    shadowRadius: 5,
    elevation: 5,
    height: height * 0.11,
    width: width * 0.9,
  },
  scrollViewContainer: {
    width: width * 1,
    marginBottom: RFValue(-100),
  },
  scrollViewContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: RFValue(10),
    top: RFValue(-20),
    alignContent: "center",
  },

  calibrationModal: {
    width: "80%",
    backgroundColor: "white",
    padding: RFValue(20),
    borderRadius: 10,
    alignItems: "center",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },

  input: {
    width: "100%",
    height: RFValue(40),
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: RFValue(10),
    marginBottom: RFValue(15),
    fontSize: RFValue(14),
  },

  slider: {
    width: "100%",
    height: RFValue(40),
    marginBottom: RFValue(15),
  },

  sliderLabel: {
    fontSize: RFValue(14),
    fontFamily: "Poppins-SemiBold",
    marginBottom: RFValue(5),
    color: "#000",
  },
});
