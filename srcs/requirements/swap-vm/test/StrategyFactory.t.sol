// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd

import { ISwapVM } from "../src/interfaces/ISwapVM.sol";
import { StrategyFactory } from "../src/StrategyFactory.sol";
import { EnsStrategyRouter } from "../src/routers/EnsStrategyRouter.sol";
import { TakerTraitsLib } from "../src/libs/TakerTraits.sol";

import { AquaSwapVMTest } from "./base/AquaSwapVMTest.sol";

/// @notice The StrategyFactory half of the BYTE-IDENTICAL cross-check: the
///         frozen reference program built ON-CHAIN from a structured spec must
///         equal the TS compiler's frozen hex (`compiler/test/emit.test.ts`
///         REFERENCE_PROGRAM_HEX) and the upstream-builders' hash
///         (`test/ReferenceProgram.t.sol`). Three independent implementations,
///         one frozen byte string — if any side drifts, its test reddens.
contract StrategyFactoryTest is AquaSwapVMTest {
    StrategyFactory public factory;

    /// @dev The router the factory's programs target: EnsStrategyRouter runs
    ///      the STRATEGY opcode table (Aqua + the two appended wave slots).
    ///      The base harness `swapVM` (stock Aqua table) cannot execute a
    ///      skew/guard program — their indices sit past its table's end.
    EnsStrategyRouter public ensRouter;

    /// ❄️ FROZEN — identical to compiler/test/emit.test.ts REFERENCE_PROGRAM_HEX.
    bytes internal constant REFERENCE_PROGRAM =
        hex"0d05006b4b2380211b694aa1769357215de4fac081bf1f309adc325306080e1000960000220e06f05b59d3b200000014005000001504002625a01c180007a120f62849f9a0b5bf2913b396098f7c7019b51a820a110014080000000000000001";

    /// ❄️ FROZEN — identical to test/ReferenceProgram.t.sol REFERENCE_PROGRAM_HASH.
    bytes32 internal constant REFERENCE_PROGRAM_HASH =
        0xade72c01e03f1f3d3a6dbebbe103d02a17ae1531227a03b58ff80597e939fd26;

    address private constant TOKEN0 = 0xF62849F9A0B5Bf2913b396098F7c7019b51A820a; // > TOKEN1 → NOT lt
    address private constant TOKEN1 = 0x5991A2dF15A8F6A256D3Ec51E99254Cd3fb576A9;
    address private constant ORACLE = 0x694AA1769357215DE4FAC081bf1f309aDC325306; // Sepolia ETH/USD

    function setUp() public override {
        super.setUp();
        factory = new StrategyFactory(address(aqua));
        ensRouter = new EnsStrategyRouter(address(aqua), address(0), address(this), "WaveEns", "1.0.0");
    }

    /// @dev The emit.test.ts reference spec, spec-for-spec: 24h deadline at
    ///      now=1.8e9, ETH/USD guard (8dp, 3600s, 150bps, revert), 0.5 skew
    ///      (slope 20, cap 80), 25bps maker / 5bps protocol (receiver=token0),
    ///      xyc curve, salt 1. Uniform 18/18 decimals (fold is a no-op → 8).
    function _referenceSpec() internal pure returns (StrategyFactory.StrategySpecInput memory s) {
        s.token0 = TOKEN0;
        s.token1 = TOKEN1;
        s.baseIsToken0 = true;
        s.token0Decimals = 18;
        s.token1Decimals = 18;
        s.hasDeadline = true;
        s.deadlineAt = 1_800_086_400;
        s.oracleGuard.enabled = true;
        s.oracleGuard.feed = ORACLE;
        s.oracleGuard.feedDecimals = 8;
        s.oracleGuard.maxStalenessSecs = 3600;
        s.oracleGuard.maxDeviationBps = 150;
        s.oracleGuard.mode = 0; // revert
        s.skew.enabled = true;
        s.skew.targetRatioMicro = 500_000; // 0.5 on the 1e-6 grid
        s.skew.slopeBps = 20;
        s.skew.maxSkewBps = 80;
        s.makerFeeBps = 25;
        s.protocolFeeBps = 5;
        s.protocolFeeReceiver = TOKEN0;
        s.curve = StrategyFactory.CurveKind.Xyc;
        s.salt.enabled = true;
        s.salt.value = 1;
    }

    // ── the frozen cross-language triangle ─────────────────────────────────

    function test_FrozenFixture_ByteIdenticalWithCompiler() public view {
        bytes memory program = factory.build(_referenceSpec());
        assertEq(program, REFERENCE_PROGRAM, "factory program drifted from the frozen fixture");
        assertEq(factory.hash(program), REFERENCE_PROGRAM_HASH, "factory hash drifted from the frozen fixture");
    }

    function test_Deterministic_TwoBuildsIdentical() public view {
        bytes memory a = factory.build(_referenceSpec());
        bytes memory b = factory.build(_referenceSpec());
        assertEq(a, b);
        assertEq(factory.hash(a), factory.hash(b));
    }

    function test_SaltChangesProgramHash() public view {
        StrategyFactory.StrategySpecInput memory s = _referenceSpec();
        s.salt.value = 2;
        bytes memory other = factory.build(s);
        assertEq(other.length, REFERENCE_PROGRAM.length);
        assertFalse(factory.hash(other) == REFERENCE_PROGRAM_HASH, "salt must perturb the program hash");
    }

    // ── the compiler's lowering rules, enforced on-chain too ───────────────

    function test_CurveRequired_InertSpecReverts() public {
        StrategyFactory.StrategySpecInput memory s = _referenceSpec();
        s.curve = StrategyFactory.CurveKind.None;
        vm.expectRevert(StrategyFactory.NoPricingInstruction.selector);
        factory.build(s);
    }

    function test_OracleFold_MixedDecimalsHitTheDecimalsByte() public view {
        // Guard layout: [op:1][len:1][feed:20][decimals:1]… → the fold lands
        // at 2 (deadline header) + 5 (deadline) + 2 (guard header) + 20 (feed).
        uint256 decimalsAt = 2 + 5 + 2 + 20;

        bytes memory uniform = factory.build(_referenceSpec());
        assertEq(uint8(uniform[decimalsAt]), 8, "18/18 pair: fold is a no-op (8+18-18)");

        StrategyFactory.StrategySpecInput memory mixed = _referenceSpec();
        mixed.token1Decimals = 6; // WETH 18 / USDC 6
        bytes memory program = factory.build(mixed);
        assertEq(uint8(program[decimalsAt]), 20, "fold must be feed(8)+base(18)-quote(6)");
    }

    function test_OracleFold_NegativeFoldReverts() public {
        StrategyFactory.StrategySpecInput memory s = _referenceSpec();
        s.token0Decimals = 6; // base 6 - quote 18 + feed 8 = -4
        vm.expectRevert(abi.encodeWithSelector(StrategyFactory.OracleDecimalsOutOfRange.selector, -4));
        factory.build(s);
    }

    function test_ConcentrationBandInvertsOnNonLtPair() public view {
        // Mirror of emit.test.ts "scaling": token0 NOT lt → P(gt per lt) band
        // inverts [1,4] → [1/4,1] → floor-isqrt sqrt = [0.5e18, 1e18].
        StrategyFactory.StrategySpecInput memory s = _referenceSpec();
        s.concentration.enabled = true;
        s.concentration.priceMinE12 = 1e12; // price 1 (token1-per-token0)
        s.concentration.priceMaxE12 = 4e12; // price 4
        bytes memory program = factory.build(s);
        assertTrue(_contains(program, abi.encodePacked(uint256(0.5e18))), "sqrtMin must be 0.5e18");
        assertTrue(_contains(program, abi.encodePacked(uint256(1e18))), "sqrtMax must be 1e18");
    }

    // ── execution: factory bytes ship and quote on a real router ──────────

    function test_ExecutesOnRouter_ShipAndQuote() public {
        StrategyFactory.StrategySpecInput memory s = _referenceSpec();
        s.token0 = address(tokenA);
        s.token1 = address(tokenB);
        s.deadlineAt = uint40(block.timestamp + 3600);
        s.oracleGuard.enabled = false; // no oracle wiring needed for the smoke
        s.concentration.enabled = false;

        bytes memory program = factory.build(s);
        // The frozen-equivalence contract above proves the BYTES; this proves
        // such bytes execute on the router that will actually run them in
        // production: ship to Aqua through EnsStrategyRouter, then quote both
        // sizes through it.
        ISwapVM.Order memory order = createStrategy(program);
        shipStrategy(ensRouter, order, tokenA, tokenB, 1000e18, 1000e18);

        bytes memory takerData = _packTakerData(order);
        (, uint256 out1,) = ensRouter.asView().quote(order, address(tokenA), address(tokenB), 1e18, takerData);
        (, uint256 out2,) = ensRouter.asView().quote(order, address(tokenA), address(tokenB), 2e18, takerData);

        assertGt(out1, 0, "a priced fill must quote non-zero out");
        assertGt(out2, out1, "quotes must be monotonic in size");
        assertLt(out2, 2 * out1, "quotes must be subadditive (concave curve + fees)");
    }

    // ── authorship ──────────────────────────────────────────────────────────

    /// @notice The deployer attributes a strategyId once, emitting the frozen
    ///         event with both keys indexed (the subgraph's Strategy.author source)
    function test_Attribute_EmitsFrozenEvent() public {
        bytes32 id = keccak256("wave-attribution-test");
        address author = 0xAB459eB72e55d8BCACf762165d96281e0996Cb95;

        vm.expectEmit(true, true, true, true, address(factory));
        emit StrategyFactory.StrategyAttributed(id, author);

        factory.attribute(id, author);
        assertEq(factory.strategyAuthor(id), author, "authorship must be recorded");
        assertEq(factory.owner(), address(this), "setUp's deployer must own attribution");
    }

    /// @notice Attribution is owner-only
    function test_Attribute_NonOwnerReverts() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(StrategyFactory.NotOwner.selector);
        factory.attribute(bytes32(uint256(1)), address(0xBEEF));
    }

    /// @notice Authorship is append-only — a second call reverts even for the owner
    function test_Attribute_SecondCallReverts() public {
        factory.attribute(bytes32(uint256(1)), address(0xA11CE));
        vm.expectRevert(StrategyFactory.AlreadyAttributed.selector);
        factory.attribute(bytes32(uint256(1)), address(0xA11CE));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    /// @dev TakerTraits pack for a plain exactIn quote, maker-signed — same
    ///      shape as BaseFeeAdjuster.t.sol's `_signAndPackTakerData`.
    function _packTakerData(ISwapVM.Order memory order) private view returns (bytes memory) {
        bytes32 orderHash = ensRouter.hash(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, orderHash);
        bytes memory takerTraits = TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: address(0),
                isExactIn: true,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: false,
                threshold: "",
                to: address(this),
                deadline: 0,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: abi.encodePacked(r, s, v)
            })
        );
        return abi.encodePacked(takerTraits);
    }

    function _contains(bytes memory haystack, bytes memory needle) private pure returns (bool) {
        if (needle.length == 0 || needle.length > haystack.length) {
            return false;
        }
        for (uint256 i = 0; i <= haystack.length - needle.length; i++) {
            bool matched = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) {
                return true;
            }
        }
        return false;
    }
}
