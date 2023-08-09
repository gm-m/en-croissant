import {
  ActionIcon,
  Alert,
  Box,
  createStyles,
  Group,
  Input,
  Stack,
  Tooltip,
} from "@mantine/core";
import { useClickOutside, useHotkeys, useViewportSize } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconChessBishopFilled,
  IconChessFilled,
  IconChessKnightFilled,
  IconChessQueenFilled,
  IconChessRookFilled,
  IconDeviceFloppy,
  IconEdit,
  IconPlus,
  IconSwitchVertical,
} from "@tabler/icons-react";
import {
  BISHOP,
  Chess,
  KNIGHT,
  PieceSymbol,
  QUEEN,
  ROOK,
  Square,
} from "chess.js";
import { DrawShape } from "chessground/draw";
import { Color } from "chessground/types";
import { memo, useContext, useMemo, useState } from "react";
import Chessground from "react-chessground";
import {
  getMaterialDiff,
  handleMove,
  moveToKey,
  parseKeyboardMove,
  parseUci,
  PiecesCount,
  toDests,
} from "@/utils/chess";
import { Outcome } from "@/utils/db";
import { formatMove } from "@/utils/format";
import { invoke } from "@/utils/invoke";
import { getBoardSize } from "@/utils/misc";
import { GameHeaders, TreeNode } from "@/utils/treeReducer";
import Piece from "../common/Piece";
import { TreeDispatchContext } from "../common/TreeStateContext";
import EvalBar from "./EvalBar";
import { useAtomValue } from "jotai";
import {
  autoPromoteAtom,
  autoSaveAtom,
  currentTabAtom,
  forcedEnPassantAtom,
  moveInputAtom,
  showArrowsAtom,
  showDestsAtom,
} from "@/atoms/atoms";

const useStyles = createStyles(() => ({
  chessboard: {
    position: "relative",
    marginRight: "auto",
    marginLeft: "auto",
    zIndex: 1,
  },
}));

interface ChessboardProps {
  dirty: boolean;
  currentNode: TreeNode;
  arrows: string[];
  headers: GameHeaders;
  editingMode: boolean;
  toggleEditingMode: () => void;
  viewOnly?: boolean;
  disableVariations?: boolean;
  side?: Color;
  boardRef: React.MutableRefObject<HTMLDivElement | null>;
  saveFile?: () => void;
  addGame?: () => void;
}

function BoardPlay({
  dirty,
  currentNode,
  headers,
  arrows,
  editingMode,
  toggleEditingMode,
  viewOnly,
  disableVariations,
  side,
  boardRef,
  saveFile,
  addGame,
}: ChessboardProps) {
  const dispatch = useContext(TreeDispatchContext);
  let chess: Chess | null;
  let error: string | null = null;
  try {
    chess = new Chess(currentNode.fen);
  } catch (e) {
    chess = null;
    if (e instanceof Error) {
      error = e.message;
    }
  }

  if (chess !== null && chess.isGameOver() && headers.result === "*") {
    let newOutcome: Outcome = "1/2-1/2";
    if (chess.isCheckmate()) {
      newOutcome = chess.turn() === "w" ? "0-1" : "1-0";
    }
    dispatch({
      type: "SET_HEADERS",
      payload: {
        ...headers,
        result: newOutcome,
      },
    });
  }

  const moveInput = useAtomValue(moveInputAtom);
  const showDests = useAtomValue(showDestsAtom);
  const showArrows = useAtomValue(showArrowsAtom);
  const autoPromote = useAtomValue(autoPromoteAtom);
  const forcedEP = useAtomValue(forcedEnPassantAtom);
  const autoSave = useAtomValue(autoSaveAtom);

  const activeTab = useAtomValue(currentTabAtom);

  const dests = toDests(chess, forcedEP);
  const turn = chess ? formatMove(chess.turn()) : undefined;
  const [pendingMove, setPendingMove] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  const orientation = headers.orientation || "white";
  const toggleOrientation = () =>
    dispatch({
      type: "SET_HEADERS",
      payload: {
        ...headers,
        orientation: headers.orientation === "white" ? "black" : "white",
      },
    });
  const { classes } = useStyles();
  const { height, width } = useViewportSize();

  const boardSize = getBoardSize(height, width);

  useHotkeys([["f", () => toggleOrientation()]]);

  let shapes: DrawShape[] =
    showArrows && arrows.length > 0
      ? arrows.map((move, i) => {
          const { from, to } = parseUci(move);
          return {
            orig: from,
            dest: to,
            brush: i === 0 ? "paleBlue" : "paleGrey",
          };
        })
      : [];

  if (currentNode.shapes.length > 0) {
    shapes = shapes.concat(currentNode.shapes);
  }

  const controls = useMemo(
    () => (
      <Group>
        {!disableVariations && (
          <Tooltip label={"Edit Position"}>
            <ActionIcon onClick={() => toggleEditingMode()}>
              <IconEdit />
            </ActionIcon>
          </Tooltip>
        )}
        {saveFile && (
          <Tooltip label={"Save PGN"}>
            <ActionIcon
              onClick={() => saveFile()}
              variant={dirty && !autoSave ? "outline" : "subtle"}
            >
              <IconDeviceFloppy />
            </ActionIcon>
          </Tooltip>
        )}
        {addGame && activeTab?.file && (
          <Tooltip label={"Add Game"}>
            <ActionIcon onClick={() => addGame()}>
              <IconPlus />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label={"Flip Board"}>
          <ActionIcon onClick={() => toggleOrientation()}>
            <IconSwitchVertical />
          </ActionIcon>
        </Tooltip>
      </Group>
    ),
    [disableVariations, saveFile, toggleEditingMode, toggleOrientation, addGame]
  );

  const { pieces, diff } = getMaterialDiff(currentNode.fen);

  return (
    <>
      {width > 800 && (
        <EvalBar
          score={currentNode.score}
          boardSize={boardSize}
          orientation={orientation}
        />
      )}

      <Stack justify="center">
        {error && (
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            title="Invalid position"
            color="red"
          >
            {error}
          </Alert>
        )}
        <Box className={classes.chessboard} ref={boardRef} mt={10}>
          <PromotionModal
            pendingMove={pendingMove}
            setPendingMove={setPendingMove}
            turn={turn}
          />
          <Box sx={{ position: "absolute", top: -30 }}>
            <ShowMaterial
              diff={diff}
              pieces={pieces}
              color={orientation === "white" ? "black" : "white"}
            />
          </Box>
          <Box sx={{ position: "absolute", bottom: -30 }}>
            <ShowMaterial diff={diff} pieces={pieces} color={orientation} />
          </Box>
          <Chessground
            width={boardSize}
            height={boardSize}
            orientation={side ?? orientation}
            fen={currentNode.fen}
            coordinates={false}
            movable={{
              free: editingMode,
              color: editingMode ? "both" : turn,
              dests:
                editingMode || viewOnly
                  ? undefined
                  : disableVariations && currentNode.children.length > 0
                  ? undefined
                  : dests,
              showDests,
              events: {
                after: (orig, dest, metadata) => {
                  if (editingMode) {
                    invoke<string>("make_move", {
                      fen: currentNode.fen,
                      from: orig,
                      to: dest,
                    }).then((newFen) => {
                      dispatch({
                        type: "SET_FEN",
                        payload: newFen,
                      });
                    });
                    // dispatch({
                    //   type: "MAKE_MOVE",
                    //   payload: {
                    //     from: orig as Square,
                    //     to: dest as Square,
                    //   },
                    // });
                  } else {
                    if (chess) {
                      const newDest = handleMove(chess, orig, dest);
                      if (
                        chess.get(orig as Square).type === "p" &&
                        ((newDest[1] === "8" && turn === "white") ||
                          (newDest[1] === "1" && turn === "black"))
                      ) {
                        if (autoPromote && !metadata.ctrlKey) {
                          dispatch({
                            type: "MAKE_MOVE",
                            payload: {
                              from: orig as Square,
                              to: newDest,
                              promotion: QUEEN,
                            },
                          });
                        } else {
                          setPendingMove({ from: orig as Square, to: newDest });
                        }
                      } else {
                        dispatch({
                          type: "MAKE_MOVE",
                          payload: {
                            from: orig as Square,
                            to: newDest,
                          },
                        });
                      }
                    }
                  }
                },
              },
            }}
            turnColor={turn}
            check={chess?.inCheck()}
            lastMove={moveToKey(currentNode.move)}
            drawable={{
              enabled: true,
              visible: true,
              defaultSnapToValidMove: true,
              eraseOnClick: true,
              autoShapes: shapes,
              onChange: (shapes) => {
                dispatch({
                  type: "SET_SHAPES",
                  payload: shapes,
                });
              },
            }}
          />
        </Box>

        <Group position={"apart"} h={20}>
          <Group>{moveInput && <MoveInput currentNode={currentNode} />}</Group>

          {controls}
        </Group>
      </Stack>
    </>
  );
}

function MoveInput({ currentNode }: { currentNode: TreeNode }) {
  const dispatch = useContext(TreeDispatchContext);
  const [move, setMove] = useState("");
  const [error, setError] = useState("");

  return (
    <Input
      size="sm"
      w={80}
      onChange={(e) => {
        setMove(e.currentTarget.value);
        setError("");
      }}
      error={error}
      value={move}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const m = move.trim();
          if (m.length > 0) {
            const parsed = parseKeyboardMove(m, currentNode.fen);
            if (parsed) {
              dispatch({
                type: "MAKE_MOVE",
                payload: parsed,
              });
              setMove("");
            } else {
              setError("Invalid move");
            }
          }
        }
      }}
    />
  );
}

const fileToNumber: Record<string, number> = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 6,
  g: 7,
  h: 8,
};

const PromotionModal = memo(function PromotionModal({
  pendingMove,
  setPendingMove,
  turn,
}: {
  pendingMove: { from: Square; to: Square } | null;
  setPendingMove: (move: { from: Square; to: Square } | null) => void;
  turn?: Color;
}) {
  const dispatch = useContext(TreeDispatchContext);
  const file = fileToNumber[pendingMove?.to[0] ?? "a"];
  const rank = parseInt(pendingMove?.to[1] ?? "1");
  const ref = useClickOutside(() => setPendingMove(null));

  const promotionPieces: PieceSymbol[] = [QUEEN, KNIGHT, ROOK, BISHOP];
  if (turn === "black") {
    promotionPieces.reverse();
  }

  return (
    <>
      {pendingMove && (
        <>
          <div
            style={{
              position: "absolute",
              zIndex: 100,
              width: "100%",
              height: "100%",
              background: "rgba(0,0,0,0.5)",
            }}
          />
          <div
            ref={ref}
            style={{
              position: "absolute",
              zIndex: 100,
              left: `${(file - 1) * 12.5}%`,
              top: rank === 1 ? "50%" : "0%",
              background: "rgba(255,255,255,0.8)",
            }}
          >
            <Stack spacing={0}>
              {promotionPieces.map((p) => (
                <ActionIcon
                  key={p}
                  w="100%"
                  h="100%"
                  pos="relative"
                  onClick={() => {
                    dispatch({
                      type: "MAKE_MOVE",
                      payload: {
                        from: pendingMove!.from,
                        to: pendingMove!.to,
                        promotion: p,
                      },
                    });
                    setPendingMove(null);
                  }}
                >
                  <Piece
                    piece={{
                      type: p,
                      color: turn === "white" ? "w" : "b",
                    }}
                  />
                </ActionIcon>
              ))}
            </Stack>
          </div>
        </>
      )}
    </>
  );
});

function ShowMaterial({
  pieces,
  diff,
  color,
}: {
  pieces: PiecesCount;
  color: Color;
  diff: number;
}) {
  let compare;
  if (color === "white") compare = (v: number) => v > 0;
  else compare = (v: number) => v < 0;

  const pawns = [...Array(Math.abs(pieces.p)).keys()].map((i) => (
    <IconChessFilled key={i} />
  ));
  const knights = [...Array(Math.abs(pieces.n)).keys()].map((i) => (
    <IconChessKnightFilled key={i} />
  ));
  const bishops = [...Array(Math.abs(pieces.b)).keys()].map((i) => (
    <IconChessBishopFilled key={i} />
  ));
  const rooks = [...Array(Math.abs(pieces.r)).keys()].map((i) => (
    <IconChessRookFilled key={i} />
  ));
  const queens = [...Array(Math.abs(pieces.q)).keys()].map((i) => (
    <IconChessQueenFilled key={i} />
  ));

  return (
    <Group spacing="xs">
      <Group spacing={0}>
        {compare(pieces.p) && pawns}
        {compare(pieces.n) && knights}
        {compare(pieces.b) && bishops}
        {compare(pieces.r) && rooks}
        {compare(pieces.q) && queens}
      </Group>
      {compare(diff) && (diff > 0 ? "+" + diff : diff)}
    </Group>
  );
}

export default memo(BoardPlay);
