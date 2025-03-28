import * as React from "react";
import Svg, { Rect, Defs, Pattern, Use, Image } from "react-native-svg";
const WifiIcon = (props: any) => (
  <Svg
    width={35}
    height={35}
    viewBox="0 0 101 101"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    xmlnsXlink="http://www.w3.org/1999/xlink"
    {...props}
  >
    <Rect
      x={0.719971}
      y={0.609985}
      width={100}
      height={100}
      fill="url(#pattern0_108_27)"
    />
    <Defs>
      <Pattern
        id="pattern0_108_27"
        patternContentUnits="objectBoundingBox"
        width={1}
        height={1}
      >
        <Use xlinkHref="#image0_108_27" transform="scale(0.01)" />
      </Pattern>
      <Image
        id="image0_108_27"
        width={100}
        height={100}
        preserveAspectRatio="none"
        xlinkHref="data:image/png;base64,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"
      />
    </Defs>
  </Svg>
);
export default WifiIcon;
