import {
  Alert,
  Animated,
  BackHandler,
  Modal,
  StyleSheet,
  Text,
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
    }, 180000); // Check every 120 seconds

    return () => clearInterval(interval); // Cleanup on unmount
  }, [esp32IpAddress]);

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
        setBatteryPercentage(data.battery);
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
    const storedIpAddress = await AsyncStorage.getItem("esp32IpAddress");
    if (storedIpAddress) {
      setEsp32IpAddress(storedIpAddress);
      verifyHomeWifiConnection(storedIpAddress);
    }
  };

  const verifyHomeWifiConnection = useCallback(async (ipAddress: string) => {
    try {
      const currentSSID = await WifiManager.getCurrentWifiSSID();
      const storedSSID = await AsyncStorage.getItem("homeWifiSSID");
      const response = await fetch(`http://${ipAddress}/ping`);

      if (currentSSID === storedSSID && response.ok) {
        setConnected(true);
      } else {
        setConnected(false);
        Alert.alert("Not Connected", "Please connect to Home Wi-Fi.");
      }
    } catch (error: any) {
      Alert.alert(
        "Error",
        "Connection Lost.\n" + "Check Home Wi-Fi connection."
      );
      setConnected(false);
      console.error("Error verifying Home Wi-Fi connection:", error);
    }
  }, []);

  const toggleDoorLock = async () => {
    const url = `http://${esp32IpAddress}/${
      doorState === "closed" ? "open" : "close"
    }`;
    try {
      setLoading(true);
      const response = await fetch(url);
      if (response.ok) {
        setDoorState(doorState === "closed" ? "open" : "closed");
        const newDoorState = doorState === "closed" ? "open" : "closed";
        setDoorState(newDoorState);
        await AsyncStorage.setItem("door_state", newDoorState);
      }
    } catch (error) {
      Alert.alert("Error", "Unable to toggle door lock.");
      console.error("Error toggling door lock:", error);
    } finally {
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
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 10 seconds timeout

      await fetch(resetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      // Assuming success since ESP32 won't send a response back
      Alert.alert("Success", "ESP32 has been reset.");
    } catch (error: any) {
      // Assuming success if there is a network error or timeout
      if (
        error.name === "AbortError" ||
        error.message.includes("Network request failed")
      ) {
        console.log("ESP32 has been reset.");
      } else {
        Alert.alert("Error", "Unable to reset ESP32.");
        console.error("Error resetting ESP32:", error);
      }
    } finally {
      setLoading(false);
      // Reset the animation values to ensure the Wi-Fi connect button returns to its original position
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
      ]).start(() => {
        setResetVisible(false);
        setConnected(false);
      });
    }
    setBatteryPercentage("");
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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#3E5C76", "#74ACDC"]}
        style={styles.background}
      />
      <Text style={styles.head}>Welcome Back</Text>
      <Text style={styles.subhead}>
        Your door automation companion is ready to assist you.
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

      <View style={styles.statusContainer}>
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
    bottom: RFValue(90),
    height: RFValue(50),
    flex: 1,
  },
  outerCircle: {
    alignItems: "center",
    top: RFValue(130),
    shadowOffset: {
      width: 5,
      height: 15,
    },
    shadowOpacity: 0.9,
    shadowColor: "#000",
    shadowRadius: 10,
    elevation: 20,
    // borderWidth: 1,
    borderRadius: 110,
    width: 280,
    height: 280,
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
    marginTop: 70,
    textAlign: "center",
    fontSize: RFValue(30),
    fontFamily: "Poppins-SemiBold",
    height: RFValue(40),
    color: "#fff",
  },
  subhead: {
    textAlign: "center",
    fontSize: RFValue(14),
    fontFamily: "Poppins-Reg",
    marginLeft: RFValue(20),
    marginRight: RFValue(20),
    color: "#fff",
  },
  connectBtn: {
    borderRadius: 50,
    backgroundColor: "#fff",
    width: RFValue(50),
    height: RFValue(50),
    alignItems: "center",
    justifyContent: "center",
    bottom: RFValue(100),
    shadowOffset: {
      width: 5,
      height: 15,
    },
    shadowOpacity: 0.9,
    shadowColor: "#000",
    shadowRadius: 10,
    elevation: 20,
  },

  resetBtn: {
    borderRadius: 50,
    backgroundColor: "#fff",
    width: RFValue(150),
    height: RFValue(50),
    alignItems: "center",
    justifyContent: "center",
    bottom: RFValue(180),
    shadowOffset: {
      width: 5,
      height: 15,
    },
    shadowOpacity: 0.9,
    shadowColor: "#000",
    shadowRadius: 10,
    elevation: 20,
    position: "absolute",
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
  statusContainer: {
    backgroundColor: "#fff",
    width: RFValue(300),
    height: RFValue(80),
    justifyContent: "center",
    alignItems: "center",
    borderRadius: RFValue(20),
    bottom: RFValue(50),
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
});
