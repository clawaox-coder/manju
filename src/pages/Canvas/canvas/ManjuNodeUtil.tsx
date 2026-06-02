import { ShapeUtil, Rectangle2d, HTMLContainer, T, type TLBaseShape } from 'tldraw';
import { renderByType, MANJU_NODE_SIZE, type ManjuNodeProps, type ManjuNodeType } from './ManjuNodeView';

export { MANJU_NODE_SIZE };
export type { ManjuNodeProps, ManjuNodeType };

// 画布的统一节点：一个 ShapeUtil 按 nodeType 渲染不同语义内容（renderByType
// 在 ManjuNodeView 里，纯展示、不依赖 tldraw）。剥掉了旧 React Flow 组件的交互
// （hover 按钮 / 候选态 / framer 动画）——transform/拖拽/缩放交给 tldraw。
//
// canvas-node-edit-layout 演进：从"只读镜子"改为"半可编辑工作台"——
// 节点可拖动、可缩放（canResize→true，移除 hideResizeHandles）；双击进文本
// 编辑模式仍禁用（canEdit→false，那是另一个 capability）；旋转不开放。
//
// v5 类型注记（见 improve-canvas-interaction P4.1 spike）：本项目 bundled 的
// tldraw 类型里 TLShape 是封闭联合，自定义 shape 类型不满足
// ShapeUtil<Shape extends TLShape>，故 extends ShapeUtil<any>，且 create/update
// 调用点需 `as unknown as` cast（见 CanvasSync）。

export type ManjuNodeShape = TLBaseShape<'manjuNode', ManjuNodeProps>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ManjuNodeUtil extends ShapeUtil<any> {
  static override type = 'manjuNode' as const;
  static override props = {
    w: T.number, h: T.number, nodeType: T.string, title: T.string,
    body: T.string, badge: T.string, imageUrl: T.string, status: T.string,
  };

  override getDefaultProps(): ManjuNodeProps {
    return { w: 200, h: 120, nodeType: 'script', title: '', body: '', badge: '', imageUrl: '', status: '' };
  }

  // 半可编辑：可拖动、可缩放;不允许双击编辑(那是另一回事)和旋转。
  override canResize() { return true; }
  override canEdit() { return false; }
  override hideRotateHandle() { return true; }

  override getGeometry(shape: ManjuNodeShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: ManjuNodeShape) {
    const p = shape.props as ManjuNodeProps;
    return (
      <HTMLContainer style={{ width: p.w, height: p.h }}>
        {renderByType(p)}
      </HTMLContainer>
    );
  }

  override getIndicatorPath(shape: ManjuNodeShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 12);
    return path;
  }
}
