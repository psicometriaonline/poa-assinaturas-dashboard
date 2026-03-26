declare module "react-simple-maps" {
  import type { ReactNode, SVGProps } from "react";

  export interface ComposableMapProps extends SVGProps<SVGSVGElement> {
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: ReactNode;
  }

  export interface GeographiesProps {
    geography: string | object;
    children: (context: { geographies: Geography[]; outline: object; sphere: object }) => ReactNode;
  }

  export interface Geography {
    rsmKey: string;
    id: string;
    properties: Record<string, unknown>;
    geometry?: object;
  }

  export interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: Geography;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: {
      default?: React.CSSProperties;
      hover?: React.CSSProperties;
      pressed?: React.CSSProperties;
    };
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element;
  export function Geographies(props: GeographiesProps): JSX.Element;
  export function Geography(props: GeographyProps): JSX.Element;
  export function Marker(props: Record<string, unknown>): JSX.Element;
  export function Line(props: Record<string, unknown>): JSX.Element;
  export function Annotation(props: Record<string, unknown>): JSX.Element;
  export function ZoomableGroup(props: Record<string, unknown>): JSX.Element;
}
