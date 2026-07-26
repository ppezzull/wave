// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
/// @custom:license-url https://github.com/1inch/swap-vm/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
import { Script } from "forge-std/Script.sol";
import { ISwapVM } from "../src/interfaces/ISwapVM.sol";
import { StrategyOpcodes } from "../src/opcodes/StrategyOpcodes.sol";
import { Fee, FeeArgsBuilder } from "../src/instructions/Fee.sol";
import { XYCSwap } from "../src/instructions/XYCSwap.sol";
import { Controls } from "../src/instructions/Controls.sol";
import { MakerTraits, MakerTraitsLib } from "../src/libs/MakerTraits.sol";
import { Program, ProgramBuilder } from "../test/utils/ProgramBuilder.sol";
// solhint-disable no-console
import { console2 } from "forge-std/console2.sol";

/// @notice Emits the RETUNED order (new fee) so the agent can announce+ship it.
///         Read-only: prints abi.encode(order), its keccak (= Aqua strategyHash)
///         and hash(order) (= Strategy.id). No broadcast.
contract RetuneProgram is Script, StrategyOpcodes {
    using ProgramBuilder for Program;
    constructor() StrategyOpcodes(address(0)) { }
    function run() external view {
        uint32 fee = uint32(vm.envOr("RETUNE_FEE", uint256(0.005e9)));
        Program memory p = ProgramBuilder.init(_opcodes());
        bytes memory program = bytes.concat(
            p.build(Fee._flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(fee)),
            p.build(XYCSwap._xycSwapXD),
            p.build(Controls._salt, abi.encodePacked(uint64(vm.envOr("STRATEGY_SALT", uint256(1)))))
        );
        ISwapVM.Order memory o = MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: vm.addr(vm.envUint("MAKER_PRIVATE_KEY")), shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true, allowZeroAmountIn: false, receiver: address(0),
            hasPreTransferInHook: false, hasPostTransferInHook: false, hasPreTransferOutHook: false,
            hasPostTransferOutHook: false, preTransferInTarget: address(0), preTransferInData: "",
            postTransferInTarget: address(0), postTransferInData: "", preTransferOutTarget: address(0),
            preTransferOutData: "", postTransferOutTarget: address(0), postTransferOutData: "", program: program }));
        console2.log("MAKER:"); console2.logAddress(o.maker);
        console2.log("TRAITS:"); console2.logUint(MakerTraits.unwrap(o.traits));
        console2.log("DATA:"); console2.logBytes(o.data);
        console2.log("ENCODED:"); console2.logBytes(abi.encode(o));
        console2.log("STRATEGYHASH:"); console2.logBytes32(keccak256(abi.encode(o)));
    }
}
