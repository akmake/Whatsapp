import Modal from '@/components/ui/Modal';

export default function QRModal({ qrModal, onClose }) {
    return (
        <Modal onClose={onClose}>
            <div className="text-center">
                <p className="text-lg font-bold mb-1 text-[#111b21]">{qrModal.name}</p>
                <p className="text-sm text-[#8696a0] mb-5">סרוק עם וואצאפ</p>
                <img src={qrModal.qr} alt="QR" className="mx-auto w-60 h-60 rounded-xl" />
                <p className="text-xs text-[#8696a0] mt-4">וואצאפ ← מכשירים מקושרים ← קשר מכשיר</p>
            </div>
        </Modal>
    );
}
